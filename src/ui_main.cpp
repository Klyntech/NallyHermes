#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQuickStyle>
#include <QUrl>
int main(int argc, char* argv[]) {
    QGuiApplication app(argc, argv);
    app.setApplicationName("DeskDear");
    app.setOrganizationName("NallyHermes");
    QQuickStyle::setStyle("Basic");
    QQmlApplicationEngine engine;
    const QUrl url(QStringLiteral("qrc:/deskdear/ui/qml/Main.qml"));
    QObject::connect(&engine, &QQmlApplicationEngine::objectCreationFailed,
                     &app, [] { QCoreApplication::exit(1); }, Qt::QueuedConnection);
    engine.load(url);
    return app.exec();
}
