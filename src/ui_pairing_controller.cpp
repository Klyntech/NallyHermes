#include "ui_pairing_controller.hpp"

#include "deskdear/device_identity.hpp"
#include "deskdear/pairing.hpp"
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QUrl>
#include <cstdlib>

namespace {

// Same production host as Android BuildConfig.API_BASE_URL.
constexpr auto kDefaultControlBase = "https://nally.onrender.com";

/*
 * Research (2026-11-28) against the live control plane + v4 server source:
 *
 *  - POST /api/mobile/pair exists and validates 10-digit Telegram codes.
 *  - POST /api/desktop/pair returns 404 (not implemented on the deployed server).
 *  - Telegram /pairdesktop issues codes via createDesktopPairingCode(), which is
 *    an alias of createMobilePairingCode() — same pairing-code store.
 *  - Successful pair response: { "accessToken": "...", "expiresAt": "..." }.
 *
 * DeskDear therefore pairs through /api/mobile/pair until a dedicated desktop
 * route is deployed. DESKDEAR_CONTROL_URL may still override the base origin.
 */
QString controlEndpoint() {
    const char* value = std::getenv("DESKDEAR_CONTROL_URL");
    QString baseStr = (value != nullptr && *value != '\0')
        ? QString::fromUtf8(value).trimmed()
        : QString::fromUtf8(kDefaultControlBase);

    while (baseStr.endsWith(QLatin1Char('/'))) {
        baseStr.chop(1);
    }

    QUrl base(baseStr);
    if (!base.isValid() || base.scheme() != QStringLiteral("https")) {
        return {};
    }

    const QString path = base.path();
    // Allow an explicit full pair URL for staging overrides.
    if (path.endsWith(QStringLiteral("/api/mobile/pair"))
        || path.endsWith(QStringLiteral("/api/desktop/pair"))) {
        return base.toString(QUrl::FullyEncoded);
    }

    QString cleaned = path;
    if (cleaned.endsWith(QLatin1Char('/'))) {
        cleaned.chop(1);
    }
    // Prefer the live mobile pair route (shared code store with /pairdesktop).
    base.setPath(cleaned + QStringLiteral("/api/mobile/pair"));
    return base.toString(QUrl::FullyEncoded);
}

}  // namespace

PairingController::PairingController(QObject* parent)
    : QObject(parent)
    , endpoint_(controlEndpoint())
    , endpointConfigured_(!endpoint_.isEmpty()) {
    try {
        const auto identity = deskdear::DeviceIdentityStore::load_or_create();
        deviceId_ = QString::fromStdString(identity.id);
        deviceName_ = QString::fromStdString(identity.display_name);
    } catch (...) {
        endpointConfigured_ = false;
    }
    status_ = endpointConfigured_
        ? QStringLiteral("Enter the one-time code from your private Telegram chat.")
        : QStringLiteral("Pairing is ready. Configure DESKDEAR_CONTROL_URL to connect the control plane.");
}

void PairingController::submitCode(const QString& input) {
    if (busy_) {
        return;
    }
    const auto code = input.trimmed();
    if (!deskdear::is_valid_pairing_code(code.toStdString())) {
        setStatus(QStringLiteral("Enter the 10-digit code from /pairdesktop."));
        return;
    }
    if (!endpointConfigured_) {
        setStatus(QStringLiteral("The control-plane endpoint is not configured on this desktop."));
        return;
    }

    QUrl url(endpoint_);
    QNetworkRequest request(url);
    request.setHeader(QNetworkRequest::ContentTypeHeader, QStringLiteral("application/json"));
    request.setRawHeader("Cache-Control", "no-store");
    request.setRawHeader("Pragma", "no-cache");

    // Server currently requires only "code". Extra identity fields are harmless
    // and useful once a desktop-specific route lands.
    const QJsonObject payload{
        {QStringLiteral("code"), code},
        {QStringLiteral("deviceId"), deviceId_},
        {QStringLiteral("deviceName"), deviceName_},
        {QStringLiteral("client"), QStringLiteral("deskdear")}
    };
    pendingReply_ = network_.post(request, QJsonDocument(payload).toJson(QJsonDocument::Compact));
    setBusy(true);
    setStatus(QStringLiteral("Checking pairing code securely…"));
    connect(pendingReply_, &QNetworkReply::finished, this, &PairingController::handleReply);
}

void PairingController::clearStatus() {
    if (busy_) {
        return;
    }
    setStatus(endpointConfigured_
        ? QStringLiteral("Enter the one-time code from your private Telegram chat.")
        : QStringLiteral("Pairing is ready. Configure DESKDEAR_CONTROL_URL to connect the control plane."));
}

void PairingController::handleReply() {
    auto* reply = pendingReply_.data();
    pendingReply_.clear();
    setBusy(false);
    if (reply == nullptr) {
        return;
    }

    const auto error = reply->error();
    const auto body = reply->readAll();
    const int httpStatus = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();

    if (error != QNetworkReply::NoError) {
        if (httpStatus == 404) {
            setStatus(QStringLiteral(
                "Pairing route not found on the control plane. Update DeskDear or the server."));
        } else if (httpStatus == 429) {
            setStatus(QStringLiteral("Too many pairing attempts. Wait a minute and try again."));
        } else if (httpStatus == 401) {
            setStatus(QStringLiteral("That pairing code is invalid, expired, or already used."));
        } else {
            setStatus(QStringLiteral("Pairing could not reach the control plane. Try again."));
        }
        reply->deleteLater();
        return;
    }

    QJsonParseError parseError{};
    const auto document = QJsonDocument::fromJson(body, &parseError);
    const auto object = document.object();
    if (parseError.error != QJsonParseError::NoError || !document.isObject()) {
        setStatus(QStringLiteral("The control plane returned an invalid pairing response."));
        reply->deleteLater();
        return;
    }

    if (object.contains(QStringLiteral("error"))) {
        const auto serverError = object.value(QStringLiteral("error")).toString();
        setStatus(serverError.isEmpty()
            ? QStringLiteral("That pairing code is invalid, expired, or already used.")
            : serverError);
        reply->deleteLater();
        return;
    }

    // Live mobile pair returns accessToken; keep deviceToken as a future alias.
    QString token = object.value(QStringLiteral("accessToken")).toString();
    if (token.isEmpty()) {
        token = object.value(QStringLiteral("deviceToken")).toString();
    }
    if (token.isEmpty() || token.size() < 40) {
        setStatus(QStringLiteral("Pairing response did not contain a valid device credential."));
        reply->deleteLater();
        return;
    }

    // Memory-only until OS keystore storage is implemented.
    sessionToken_ = token.toUtf8();
    setPaired(true);
    setStatus(QStringLiteral("DeskDear is paired with your Nally account."));
    reply->deleteLater();
}

void PairingController::setStatus(const QString& value) {
    if (status_ == value) {
        return;
    }
    status_ = value;
    emit statusChanged();
}

void PairingController::setBusy(const bool value) {
    if (busy_ == value) {
        return;
    }
    busy_ = value;
    emit busyChanged();
}

void PairingController::setPaired(const bool value) {
    if (paired_ == value) {
        return;
    }
    paired_ = value;
    emit pairedChanged();
}
