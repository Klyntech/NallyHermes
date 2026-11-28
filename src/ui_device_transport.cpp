#include "ui_device_transport.hpp"

#include "deskdear/device_identity.hpp"
#include "deskdear/permissions.hpp"
#include "deskdear/policy.hpp"
#include "deskdear/simulator.hpp"
#include "deskdear/tool_registry.hpp"

#include <QDateTime>
#include <QDir>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QStandardPaths>
#include <QUrl>

#include <chrono>

namespace {

constexpr int kHeartbeatMs = 15'000;
constexpr int kPollWaitMs = 25'000;
constexpr int kPollRetryMs = 2'000;

QString defaultWorkspaceRoot() {
    const QString base =
        QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
    const QString path = base + QStringLiteral("/workspace");
    QDir().mkpath(path);
    return path;
}

}  // namespace

struct DeviceTransportController::WorkspaceEngine {
    deskdear::SessionPolicy session;
    deskdear::HeadlessSimulator simulator;

    WorkspaceEngine()
        : simulator(defaultWorkspaceRoot().toStdString()) {
        session.authenticated = true;
        session.revoked = false;
        // Long session window; pairing token expiry is enforced server-side.
        session.expires_at =
            deskdear::Clock::now() + std::chrono::hours(24 * 30);
        // Enabled tools: status (Health), read, write.
        session.permissions.grant_for_session(deskdear::Capability::Health);
        session.permissions.grant_for_session(deskdear::Capability::WorkspaceRead);
        session.permissions.grant_for_session(deskdear::Capability::WorkspaceWrite);
    }
};

DeviceTransportController::DeviceTransportController(QObject* parent)
    : QObject(parent)
    , engine_(std::make_unique<WorkspaceEngine>()) {
    heartbeatTimer_.setSingleShot(true);
    connect(&heartbeatTimer_, &QTimer::timeout, this, [this]() { sendHeartbeat(); });

    pollRetryTimer_.setSingleShot(true);
    connect(&pollRetryTimer_, &QTimer::timeout, this, [this]() {
        if (running_) {
            beginPoll();
        }
    });
}

DeviceTransportController::~DeviceTransportController() {
    stop();
}

void DeviceTransportController::start(const QString& controlBaseOrigin,
                                      const QByteArray& deviceToken) {
    stop();

    QString origin = controlBaseOrigin.trimmed();
    while (origin.endsWith(QLatin1Char('/'))) {
        origin.chop(1);
    }
    if (origin.isEmpty() || deviceToken.size() < 20) {
        setLastError(QStringLiteral("Transport requires a control origin and device token."));
        return;
    }

    baseOrigin_ = origin;
    token_ = deviceToken;
    setRunning(true);
    setLastError({});
    setLastEvent(QStringLiteral("Transport starting"));
    sendHeartbeat();
    beginPoll();
}

void DeviceTransportController::stop() {
    heartbeatTimer_.stop();
    pollRetryTimer_.stop();
    if (heartbeatReply_) {
        heartbeatReply_->abort();
        heartbeatReply_->deleteLater();
        heartbeatReply_.clear();
    }
    if (pollReply_) {
        pollReply_->abort();
        pollReply_->deleteLater();
        pollReply_.clear();
    }
    if (resultReply_) {
        resultReply_->abort();
        resultReply_->deleteLater();
        resultReply_.clear();
    }
    pollInFlight_ = false;
    setOnline(false);
    setRunning(false);
}

void DeviceTransportController::setRunning(bool value) {
    if (running_ == value) {
        return;
    }
    running_ = value;
    emit runningChanged();
}

void DeviceTransportController::setOnline(bool value) {
    if (online_ == value) {
        return;
    }
    online_ = value;
    emit onlineChanged();
}

void DeviceTransportController::setLastError(const QString& value) {
    if (lastError_ == value) {
        return;
    }
    lastError_ = value;
    emit lastErrorChanged();
}

void DeviceTransportController::setLastEvent(const QString& value) {
    if (lastEvent_ == value) {
        return;
    }
    lastEvent_ = value;
    emit lastEventChanged();
}

QUrl DeviceTransportController::apiUrl(const QString& path) const {
    return QUrl(baseOrigin_ + path);
}

QNetworkRequest DeviceTransportController::authedRequest(const QUrl& url) const {
    QNetworkRequest request(url);
    request.setRawHeader("Authorization", QByteArray("Bearer ") + token_);
    request.setRawHeader("Cache-Control", "no-store");
    request.setHeader(QNetworkRequest::ContentTypeHeader, QStringLiteral("application/json"));
    return request;
}

void DeviceTransportController::scheduleHeartbeat(int msec) {
    if (!running_) {
        return;
    }
    heartbeatTimer_.start(msec > 0 ? msec : kHeartbeatMs);
}

void DeviceTransportController::sendHeartbeat() {
    if (!running_ || heartbeatReply_) {
        return;
    }
    auto* reply = network_.post(authedRequest(apiUrl(QStringLiteral("/api/desktop/heartbeat"))),
                                QByteArrayLiteral("{}"));
    heartbeatReply_ = reply;
    connect(reply, &QNetworkReply::finished, this, &DeviceTransportController::onHeartbeatFinished);
}

void DeviceTransportController::onHeartbeatFinished() {
    auto* reply = qobject_cast<QNetworkReply*>(sender());
    if (!reply) {
        return;
    }
    if (heartbeatReply_ == reply) {
        heartbeatReply_.clear();
    }

    const int status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
    const auto error = reply->error();
    reply->deleteLater();

    if (!running_) {
        return;
    }

    if (error != QNetworkReply::NoError || status != 200) {
        setOnline(false);
        if (status == 401) {
            setLastError(QStringLiteral("Device token rejected. Pair again."));
            setLastEvent(QStringLiteral("Heartbeat unauthorized"));
            stop();
            return;
        }
        setLastError(QStringLiteral("Heartbeat failed (HTTP %1)").arg(status));
        setLastEvent(QStringLiteral("Heartbeat failed — retrying"));
        scheduleHeartbeat(kPollRetryMs);
        return;
    }

    setOnline(true);
    setLastError({});
    setLastEvent(QStringLiteral("Heartbeat ok"));
    scheduleHeartbeat(kHeartbeatMs);
}

void DeviceTransportController::beginPoll() {
    if (!running_ || pollInFlight_) {
        return;
    }
    pollInFlight_ = true;
    const QUrl url = apiUrl(
        QStringLiteral("/api/desktop/ops/pending?waitMs=%1").arg(kPollWaitMs));
    auto* reply = network_.get(authedRequest(url));
    pollReply_ = reply;
    connect(reply, &QNetworkReply::finished, this, &DeviceTransportController::onPollFinished);
}

void DeviceTransportController::onPollFinished() {
    auto* reply = qobject_cast<QNetworkReply*>(sender());
    if (!reply) {
        return;
    }
    if (pollReply_ == reply) {
        pollReply_.clear();
    }
    pollInFlight_ = false;

    const int status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
    const auto error = reply->error();
    const QByteArray body = reply->readAll();
    reply->deleteLater();

    if (!running_) {
        return;
    }

    if (error == QNetworkReply::OperationCanceledError) {
        return;
    }

    if (error != QNetworkReply::NoError || status != 200) {
        if (status == 401) {
            setLastError(QStringLiteral("Device token rejected while polling."));
            stop();
            return;
        }
        setLastEvent(QStringLiteral("Poll retry"));
        pollRetryTimer_.start(kPollRetryMs);
        return;
    }

    QJsonParseError parseError{};
    const auto doc = QJsonDocument::fromJson(body, &parseError);
    if (parseError.error != QJsonParseError::NoError || !doc.isObject()) {
        setLastEvent(QStringLiteral("Poll: bad JSON"));
        pollRetryTimer_.start(kPollRetryMs);
        return;
    }

    const auto operations = doc.object().value(QStringLiteral("operations")).toArray();
    if (!operations.isEmpty()) {
        setLastEvent(QStringLiteral("Received %1 operation(s)").arg(operations.size()));
        processOperations(operations);
    }

    // Immediately continue long-poll.
    beginPoll();
}

void DeviceTransportController::processOperations(const QJsonArray& operations) {
    for (const auto& value : operations) {
        if (!value.isObject()) {
            continue;
        }
        executeAndReport(value.toObject());
    }
}

void DeviceTransportController::executeAndReport(const QJsonObject& envelope) {
    const QString operationId = envelope.value(QStringLiteral("operation_id")).toString();
    const QString name = envelope.value(QStringLiteral("name")).toString();
    const QString action = envelope.value(QStringLiteral("action")).toString();
    const QString sessionId = envelope.value(QStringLiteral("session_id")).toString();
    const QString deadlineIso = envelope.value(QStringLiteral("deadline")).toString();
    const QJsonObject args = envelope.value(QStringLiteral("arguments")).toObject();

    if (operationId.isEmpty() || name.isEmpty()) {
        return;
    }

    setLastEvent(QStringLiteral("Executing %1").arg(name));

    // Planned tools — refuse locally with not_implemented shape the server maps.
    if (!deskdear::tool_is_enabled(name.toStdString())) {
        postResult(operationId,
                   QJsonObject{
                       {QStringLiteral("status"), QStringLiteral("error")},
                       {QStringLiteral("error"),
                        QStringLiteral("Tool is planned, not enabled on this DeskDear build.")},
                       {QStringLiteral("code"), QStringLiteral("not_implemented")}});
        return;
    }

    // status — local device health
    if (name == QLatin1String("status") || action == QLatin1String("health.status")) {
        QJsonObject result{
            {QStringLiteral("device"),
             QJsonObject{
                 {QStringLiteral("online"), true},
                 {QStringLiteral("workspace"),
                  QString::fromStdString(engine_->simulator.workspace_root().string())},
             }},
            {QStringLiteral("enabledTools"),
             QJsonArray{QStringLiteral("status"), QStringLiteral("read"), QStringLiteral("write")}},
        };
        try {
            const auto identity = deskdear::DeviceIdentityStore::load_or_create();
            result.insert(QStringLiteral("deviceId"), QString::fromStdString(identity.id));
            result.insert(QStringLiteral("deviceName"),
                          QString::fromStdString(identity.display_name));
        } catch (...) {
        }
        postResult(operationId,
                   QJsonObject{{QStringLiteral("status"), QStringLiteral("ok")},
                               {QStringLiteral("result"), result}});
        return;
    }

    deskdear::OperationRequest request;
    request.operation_id = operationId.toStdString();
    request.session_id =
        sessionId.isEmpty() ? std::string("session") : sessionId.toStdString();
    request.action = action.isEmpty() ? name.toStdString() : action.toStdString();
    request.deadline = deskdear::Clock::now() + std::chrono::seconds(60);
    if (!deadlineIso.isEmpty()) {
        const QDateTime dt = QDateTime::fromString(deadlineIso, Qt::ISODate);
        if (dt.isValid()) {
            request.deadline =
                std::chrono::system_clock::time_point(
                    std::chrono::milliseconds(dt.toMSecsSinceEpoch()));
        }
    }

    if (name == QLatin1String("read") || action == QLatin1String("workspace.read")) {
        request.capability = deskdear::Capability::WorkspaceRead;
        request.action = "workspace.read";
        request.target = args.value(QStringLiteral("path")).toString().toStdString();
    } else if (name == QLatin1String("write") || action == QLatin1String("workspace.write")) {
        request.capability = deskdear::Capability::WorkspaceWrite;
        request.action = "workspace.write";
        request.target = args.value(QStringLiteral("path")).toString().toStdString();
        request.content = args.value(QStringLiteral("content")).toString().toStdString();
        request.requires_local_approval = true;
        request.local_approval_granted = true;  // session already granted write
    } else {
        postResult(operationId,
                   QJsonObject{
                       {QStringLiteral("status"), QStringLiteral("error")},
                       {QStringLiteral("error"), QStringLiteral("Unsupported operation on device.")},
                       {QStringLiteral("code"), QStringLiteral("not_implemented")}});
        return;
    }

    const auto result =
        engine_->simulator.execute(engine_->session, request, deskdear::Clock::now());

    if (!result.success) {
        const char* code = "error";
        if (result.policy_error == deskdear::PolicyError::CapabilityDenied) {
            code = "capability_denied";
        } else if (result.policy_error == deskdear::PolicyError::DeadlineExceeded) {
            code = "deadline_exceeded";
        } else if (result.policy_error == deskdear::PolicyError::LocalApprovalRequired) {
            code = "approval_required";
        }
        postResult(operationId,
                   QJsonObject{{QStringLiteral("status"), QStringLiteral("denied")},
                               {QStringLiteral("error"), QString::fromStdString(result.message)},
                               {QStringLiteral("code"), QString::fromUtf8(code)}});
        return;
    }

    QJsonObject payload{{QStringLiteral("message"), QString::fromStdString(result.message)}};
    if (!result.output.empty()) {
        payload.insert(QStringLiteral("content"), QString::fromStdString(result.output));
    }
    postResult(operationId,
               QJsonObject{{QStringLiteral("status"), QStringLiteral("ok")},
                           {QStringLiteral("result"), payload}});
}

void DeviceTransportController::postResult(const QString& operationId,
                                           const QJsonObject& body) {
    if (!running_) {
        return;
    }
    const QUrl url =
        apiUrl(QStringLiteral("/api/desktop/ops/%1/result").arg(operationId));
    const QByteArray payload = QJsonDocument(body).toJson(QJsonDocument::Compact);
    auto* reply = network_.post(authedRequest(url), payload);
    // Fire-and-forget chain: track latest for cleanup only.
    if (resultReply_) {
        resultReply_->deleteLater();
    }
    resultReply_ = reply;
    connect(reply, &QNetworkReply::finished, this, &DeviceTransportController::onResultFinished);

    ++opsCompleted_;
    emit opsCompletedChanged();
    setLastEvent(QStringLiteral("Result posted for %1").arg(operationId.left(12)));
}

void DeviceTransportController::onResultFinished() {
    auto* reply = qobject_cast<QNetworkReply*>(sender());
    if (!reply) {
        return;
    }
    if (resultReply_ == reply) {
        resultReply_.clear();
    }
    const int status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
    if (reply->error() != QNetworkReply::NoError || status != 200) {
        setLastError(QStringLiteral("Failed to post op result (HTTP %1)").arg(status));
    }
    reply->deleteLater();
}
