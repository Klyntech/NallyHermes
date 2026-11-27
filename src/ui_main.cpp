#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickStyle>
#include <QUrl>
#include "ui_pairing_controller.hpp"
int main(int argc, char* argv[]) {
    QGuiApplication app(argc, argv);
    app.setApplicationName("DeskDear");
    app.setOrganizationName("NallyHermes");
    QQuickStyle::setStyle("Basic");
    QQmlApplicationEngine engine;
    PairingController pairing;
    engine.rootContext()->setContextProperty(QStringLiteral("pairing"), &pairing);
    const QUrl url(QStringLiteral("qrc:/deskdear/ui/qml/Main.qml"));
    QObject::connect(&engine, &QQmlApplicationEngine::objectCreationFailed,
                     &app, [] { QCoreApplication::exit(1); }, Qt::QueuedConnection);
    engine.load(url);
    return app.exec();
}
