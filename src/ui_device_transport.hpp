#pragma once

#include <QObject>
#include <QString>
#include <QByteArray>
#include <QNetworkAccessManager>
#include <QPointer>
#include <QTimer>
#include <memory>

class QNetworkReply;

/**
 * DeskDear ↔ control-plane device transport.
 * Heartbeat every 15s, long-poll pending ops, execute locally, POST results.
 */
class DeviceTransportController final : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool running READ running NOTIFY runningChanged)
    Q_PROPERTY(bool online READ online NOTIFY onlineChanged)
    Q_PROPERTY(QString lastError READ lastError NOTIFY lastErrorChanged)
    Q_PROPERTY(QString lastEvent READ lastEvent NOTIFY lastEventChanged)
    Q_PROPERTY(int opsCompleted READ opsCompleted NOTIFY opsCompletedChanged)

public:
    explicit DeviceTransportController(QObject* parent = nullptr);
    ~DeviceTransportController() override;

    bool running() const { return running_; }
    bool online() const { return online_; }
    QString lastError() const { return lastError_; }
    QString lastEvent() const { return lastEvent_; }
    int opsCompleted() const { return opsCompleted_; }

    /** controlBaseOrigin e.g. https://nally.onrender.com (no trailing slash). */
    Q_INVOKABLE void start(const QString& controlBaseOrigin, const QByteArray& deviceToken);
    Q_INVOKABLE void stop();

signals:
    void runningChanged();
    void onlineChanged();
    void lastErrorChanged();
    void lastEventChanged();
    void opsCompletedChanged();

private slots:
    void onHeartbeatFinished();
    void onPollFinished();
    void onResultFinished();

private:
    void setRunning(bool value);
    void setOnline(bool value);
    void setLastError(const QString& value);
    void setLastEvent(const QString& value);

    void scheduleHeartbeat(int msec = 0);
    void sendHeartbeat();
    void beginPoll();
    void processOperations(const QJsonArray& operations);
    void executeAndReport(const QJsonObject& envelope);
    void postResult(const QString& operationId, const QJsonObject& body);

    QUrl apiUrl(const QString& path) const;
    QNetworkRequest authedRequest(const QUrl& url) const;

    QNetworkAccessManager network_;
    QPointer<QNetworkReply> heartbeatReply_;
    QPointer<QNetworkReply> pollReply_;
    QPointer<QNetworkReply> resultReply_;
    QTimer heartbeatTimer_;
    QTimer pollRetryTimer_;

    QString baseOrigin_;
    QByteArray token_;
    bool running_{false};
    bool online_{false};
    bool pollInFlight_{false};
    QString lastError_;
    QString lastEvent_;
    int opsCompleted_{0};

    struct WorkspaceEngine;
    std::unique_ptr<WorkspaceEngine> engine_;
};
