#pragma once

#include <QObject>
#include <QString>
#include <QNetworkAccessManager>
#include <QPointer>
#include <QString>

class QNetworkReply;

class PairingController final : public QObject {
    Q_OBJECT
    Q_PROPERTY(QString status READ status NOTIFY statusChanged)
    Q_PROPERTY(bool busy READ busy NOTIFY busyChanged)
    Q_PROPERTY(bool paired READ paired NOTIFY pairedChanged)
    Q_PROPERTY(bool endpointConfigured READ endpointConfigured CONSTANT)

public:
    explicit PairingController(QObject* parent = nullptr);

    QString status() const { return status_; }
    bool busy() const { return busy_; }
    bool paired() const { return paired_; }
    bool endpointConfigured() const { return endpointConfigured_; }

    Q_INVOKABLE void submitCode(const QString& code);
    Q_INVOKABLE void clearStatus();

signals:
    void statusChanged();
    void busyChanged();
    void pairedChanged();

private slots:
    void handleReply();

private:
    void setStatus(const QString& value);
    void setBusy(bool value);
    void setPaired(bool value);

    QNetworkAccessManager network_;
    QPointer<QNetworkReply> pendingReply_;
    QString status_;
    QString endpoint_;
    QByteArray sessionToken_;
    QString deviceId_;
    QString deviceName_;
    bool busy_{false};
    bool paired_{false};
    bool endpointConfigured_{false};
};
