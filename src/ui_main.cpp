#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickStyle>
#include <QUrl>
#include <QDir>
#include <QFile>
#include <QTextStream>
#include <QStandardPaths>
#include <QDateTime>
#include <QMessageLogContext>

#include "ui_pairing_controller.hpp"
#include "ui_device_transport.hpp"

#ifdef Q_OS_WIN
#  ifndef NOMINMAX
#    define NOMINMAX
#  endif
#  include <windows.h>
#endif

namespace {

QFile g_logFile;

void openLogFile() {
    const QString dir =
        QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
    QDir().mkpath(dir);
    const QString path = dir + QStringLiteral("/deskdear-ui.log");
    g_logFile.setFileName(path);
    g_logFile.open(QIODevice::WriteOnly | QIODevice::Append | QIODevice::Text);
}

void writeLogLine(const QString& line) {
    if (!g_logFile.isOpen()) {
        return;
    }
    QTextStream out(&g_logFile);
    out << QDateTime::currentDateTime().toString(Qt::ISODate) << ' ' << line << '\n';
    out.flush();
}

void messageHandler(QtMsgType type, const QMessageLogContext& context, const QString& msg) {
    Q_UNUSED(context);
    const char* level = "INFO";
    switch (type) {
    case QtDebugMsg:
        level = "DEBUG";
        break;
    case QtInfoMsg:
        level = "INFO";
        break;
    case QtWarningMsg:
        level = "WARN";
        break;
    case QtCriticalMsg:
        level = "CRIT";
        break;
    case QtFatalMsg:
        level = "FATAL";
        break;
    }
    writeLogLine(QStringLiteral("[%1] %2").arg(QLatin1String(level), msg));
#ifdef Q_OS_WIN
    if (type == QtFatalMsg || type == QtCriticalMsg) {
        // Best-effort surface so a GUI-subsystem build is not completely silent.
        MessageBoxW(nullptr,
                    reinterpret_cast<LPCWSTR>(msg.utf16()),
                    L"DeskDear",
                    MB_OK | MB_ICONERROR);
    }
#endif
    if (type == QtFatalMsg) {
        abort();
    }
}

void showFatal(const QString& message) {
    writeLogLine(QStringLiteral("[FATAL] ") + message);
#ifdef Q_OS_WIN
    MessageBoxW(nullptr,
                reinterpret_cast<LPCWSTR>(message.utf16()),
                L"DeskDear failed to start",
                MB_OK | MB_ICONERROR);
#endif
}

}  // namespace

int main(int argc, char* argv[]) {
    QGuiApplication app(argc, argv);
    app.setApplicationName(QStringLiteral("DeskDear"));
    app.setOrganizationName(QStringLiteral("NallyHermes"));
    app.setApplicationVersion(QStringLiteral("0.1.0"));

    openLogFile();
    qInstallMessageHandler(messageHandler);
    writeLogLine(QStringLiteral("DeskDear UI starting"));
    writeLogLine(QStringLiteral("Log file: ") + g_logFile.fileName());

    // Basic is the only style guaranteed without extra plugin folders in some deploys.
    QQuickStyle::setStyle(QStringLiteral("Basic"));

    QQmlApplicationEngine engine;

    // Fail loudly if the QML document cannot be created.
    QObject::connect(
        &engine,
        &QQmlApplicationEngine::objectCreationFailed,
        &app,
        [](const QUrl& url) {
            showFatal(QStringLiteral(
                "Could not create the DeskDear window from:\n%1\n\n"
                "Check %LOCALAPPDATA%\\NallyHermes\\DeskDear\\deskdear-ui.log")
                          .arg(url.toString()));
            QCoreApplication::exit(1);
        },
        Qt::QueuedConnection);

    PairingController pairing;
    DeviceTransportController transport;
    engine.rootContext()->setContextProperty(QStringLiteral("pairing"), &pairing);
    engine.rootContext()->setContextProperty(QStringLiteral("transport"), &transport);

    QObject::connect(&pairing, &PairingController::pairedChanged, &transport, [&]() {
        if (pairing.paired()) {
            const QString origin = pairing.controlBaseOriginConstant();
            const QByteArray token = pairing.deviceToken().toUtf8();
            if (!origin.isEmpty() && token.size() >= 20) {
                transport.start(origin, token);
            }
        } else {
            transport.stop();
        }
    });

    const QUrl url(QStringLiteral("qrc:/deskdear/ui/qml/Main.qml"));
    writeLogLine(QStringLiteral("Loading QML: ") + url.toString());
    engine.load(url);

    if (engine.rootObjects().isEmpty()) {
        showFatal(
            QStringLiteral(
                "DeskDear UI loaded no window.\n\n"
                "Common causes on Windows:\n"
                "• Missing Qt Quick / platform plugins next to deskdear-ui.exe\n"
                "• Broken install (re-run Setup or use the portable ZIP)\n\n"
                "Log: %1")
                .arg(g_logFile.fileName()));
        return 1;
    }

    writeLogLine(QStringLiteral("UI window created"));
    return app.exec();
}
