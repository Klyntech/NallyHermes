import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ApplicationWindow {
    id: window
    visible: true
    width: 1280
    height: 800
    minimumWidth: 980
    minimumHeight: 640
    title: "DeskDear"
    color: theme.canvas

    QtObject {
        id: theme
        readonly property color canvas: "#0D0F12"
        readonly property color panel: "#15181D"
        readonly property color raised: "#1C2027"
        readonly property color border: "#2A3038"
        readonly property color text: "#F2F4F7"
        readonly property color muted: "#9AA3AF"
        readonly property color mint: "#A7E8C3"
        readonly property color gold: "#E9B872"
        readonly property color coral: "#F28F8F"
        readonly property color blueGray: "#9DB7D3"
    }
    property int selectedPage: 0

    component StatusDot: Rectangle {
        required property color dotColor
        width: 9
        height: 9
        radius: 5
        color: dotColor
    }

    component Pill: Rectangle {
        required property string label
        required property color accent
        implicitWidth: pillText.implicitWidth + 24
        implicitHeight: 30
        radius: 15
        color: Qt.rgba(accent.r, accent.g, accent.b, 0.12)
        border.color: Qt.rgba(accent.r, accent.g, accent.b, 0.3)
        Text {
            id: pillText
            anchors.centerIn: parent
            text: parent.label
            color: parent.accent
            font.pixelSize: 12
            font.weight: Font.DemiBold
        }
    }

    RowLayout {
        anchors.fill: parent
        spacing: 0

        Rectangle {
            Layout.fillHeight: true
            Layout.preferredWidth: 224
            color: theme.panel
            border.color: theme.border
            border.width: 1

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 18
                spacing: 0

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 10
                    Rectangle {
                        width: 32
                        height: 32
                        radius: 10
                        color: theme.gold
                        Text {
                            anchors.centerIn: parent
                            text: "D"
                            color: theme.canvas
                            font.pixelSize: 18
                            font.bold: true
                        }
                    }
                    Column {
                        spacing: 1
                        Text { text: "DeskDear"; color: theme.text; font.pixelSize: 16; font.bold: true }
                        Text { text: "DESKTOP AGENT"; color: theme.muted; font.pixelSize: 9; font.letterSpacing: 1.2 }
                    }
                }

                Item { Layout.preferredHeight: 42 }
                Text { text: "THIS COMPUTER"; color: theme.muted; font.pixelSize: 10; font.letterSpacing: 1.4 }
                RowLayout {
                    Layout.fillWidth: true
                    Layout.topMargin: 10
                    spacing: 8
                    StatusDot { dotColor: theme.mint }
                    Text { text: "Nigeria desktop"; color: theme.text; font.pixelSize: 13; Layout.fillWidth: true; elide: Text.ElideRight }
                }

                Item { Layout.preferredHeight: 30 }
                Repeater {
                    model: ["Overview", "Activity", "Permissions", "Settings"]
                    delegate: Rectangle {
                        required property string modelData
                        Layout.fillWidth: true
                        Layout.preferredHeight: 42
                        radius: 9
                        color: selectedPage === index ? theme.raised : "transparent"
                        border.color: selectedPage === index ? theme.border : "transparent"
                        RowLayout {
                            anchors.fill: parent
                            anchors.leftMargin: 12
                            anchors.rightMargin: 12
                            spacing: 11
                            Text {
                                text: ["◈", "◌", "◇", "⚙"][index]
                                color: selectedPage === index ? theme.gold : theme.muted
                                font.pixelSize: 16
                            }
                            Text {
                                text: modelData
                                color: selectedPage === index ? theme.text : theme.muted
                                font.pixelSize: 13
                                Layout.fillWidth: true
                            }
                        }
                        MouseArea { anchors.fill: parent; onClicked: selectedPage = index }
                    }
                }

                Item { Layout.fillHeight: true }
                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 82
                    radius: 12
                    color: theme.raised
                    border.color: theme.border
                    Column {
                        anchors.fill: parent
                        anchors.margins: 12
                        spacing: 6
                        Text { text: "NALLY PLANS"; color: theme.muted; font.pixelSize: 9; font.letterSpacing: 1.2 }
                        Text { text: "DESKDEAR CHECKS"; color: theme.gold; font.pixelSize: 11; font.bold: true }
                        Text { text: "YOU APPROVE"; color: theme.mint; font.pixelSize: 11; font.bold: true }
                    }
                }
            }
        }

        Rectangle {
            Layout.fillWidth: true
            Layout.fillHeight: true
            color: theme.canvas

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 38
                spacing: 24

                RowLayout {
                    Layout.fillWidth: true
                    Text {
                        text: selectedPage === 0 ? "Overview" : ["Overview", "Activity", "Permissions", "Settings"][selectedPage]
                        color: theme.text
                        font.pixelSize: 27
                        font.weight: Font.DemiBold
                        Layout.fillWidth: true
                    }
                    Pill { label: "CONNECTED"; accent: theme.mint }
                    Button {
                        text: "Open pairing"
                        flat: true
                        contentItem: Text { text: parent.text; color: theme.gold; font.pixelSize: 12; font.bold: true }
                        background: Rectangle { color: "transparent" }
                    }
                }

                Loader {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    sourceComponent: selectedPage === 0 ? overviewPage : placeholderPage
                }
            }
        }

        Rectangle {
            Layout.fillHeight: true
            Layout.preferredWidth: 310
            color: theme.panel
            border.color: theme.border
            border.width: 1

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 24
                spacing: 18
                Text { text: "CURRENT STATE"; color: theme.muted; font.pixelSize: 10; font.letterSpacing: 1.4 }
                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 176
                    radius: 14
                    color: theme.raised
                    border.color: theme.border
                    Column {
                        anchors.fill: parent
                        anchors.margins: 18
                        spacing: 12
                        Row {
                            spacing: 9
                            StatusDot { dotColor: theme.mint; anchors.verticalCenter: parent.verticalCenter }
                            Text { text: "Waiting for tasks"; color: theme.text; font.pixelSize: 15; font.bold: true }
                        }
                        Text { text: "No active control session"; color: theme.muted; font.pixelSize: 12 }
                        Rectangle { width: parent.width; height: 1; color: theme.border }
                        Text { text: "Last heartbeat"; color: theme.muted; font.pixelSize: 11 }
                        Text { text: "Just now"; color: theme.text; font.pixelSize: 13 }
                    }
                }
                Text { text: "RECENT ACTIVITY"; color: theme.muted; font.pixelSize: 10; font.letterSpacing: 1.4; Layout.topMargin: 12 }
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 13
                    Repeater {
                        model: [
                            ["Connected to Nally", "Just now", theme.mint],
                            ["Permission policy loaded", "2 min ago", theme.blueGray],
                            ["Agent self-test passed", "5 min ago", theme.gold]
                        ]
                        delegate: RowLayout {
                            required property var modelData
                            Layout.fillWidth: true
                            spacing: 10
                            StatusDot { dotColor: modelData[2]; width: 7; height: 7 }
                            ColumnLayout {
                                Layout.fillWidth: true
                                Text { text: modelData[0]; color: theme.text; font.pixelSize: 12; elide: Text.ElideRight; Layout.fillWidth: true }
                                Text { text: modelData[1]; color: theme.muted; font.pixelSize: 10 }
                            }
                        }
                    }
                }
                Item { Layout.fillHeight: true }
                Button {
                    Layout.fillWidth: true
                    text: "Stop all sessions"
                    contentItem: Text { text: parent.text; color: theme.coral; horizontalAlignment: Text.AlignHCenter; font.pixelSize: 12; font.bold: true }
                    background: Rectangle { radius: 9; color: Qt.rgba(theme.coral.r, theme.coral.g, theme.coral.b, 0.08); border.color: Qt.rgba(theme.coral.r, theme.coral.g, theme.coral.b, 0.3) }
                }
            }
        }
    }

    Component {
        id: overviewPage
        Flickable {
            contentHeight: overviewColumn.implicitHeight
            clip: true
            ColumnLayout {
                id: overviewColumn
                width: parent.width
                spacing: 18
                Text { text: "DESKDEAR / HOME DESKTOP"; color: theme.gold; font.pixelSize: 10; font.letterSpacing: 1.5 }
                Text { text: "Your computer is ready"; color: theme.text; font.pixelSize: 34; font.weight: Font.DemiBold }
                Text { text: "Nally can request approved work here. DeskDear checks every operation locally before it runs."; color: theme.muted; font.pixelSize: 14; wrapMode: Text.WordWrap; Layout.fillWidth: true }
                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 174
                    Layout.topMargin: 12
                    radius: 16
                    color: theme.panel
                    border.color: theme.border
                    RowLayout {
                        anchors.fill: parent
                        anchors.margins: 22
                        spacing: 20
                        ColumnLayout {
                            Layout.fillWidth: true
                            Text { text: "Connection"; color: theme.muted; font.pixelSize: 12 }
                            RowLayout { spacing: 10; StatusDot { dotColor: theme.mint; width: 11; height: 11 }; Text { text: "Connected"; color: theme.text; font.pixelSize: 23; font.bold: true } }
                            Text { text: "Outbound session is healthy"; color: theme.mint; font.pixelSize: 12 }
                            Text { text: "This device is waiting for an approved task."; color: theme.muted; font.pixelSize: 12 }
                        }
                        Rectangle { Layout.preferredWidth: 1; Layout.fillHeight: true; color: theme.border }
                        ColumnLayout {
                            Layout.preferredWidth: 180
                            Text { text: "SESSION"; color: theme.muted; font.pixelSize: 10; font.letterSpacing: 1.2 }
                            Text { text: "Inactive"; color: theme.text; font.pixelSize: 15; font.bold: true }
                            Text { text: "No permissions in use"; color: theme.muted; font.pixelSize: 11; wrapMode: Text.WordWrap; Layout.fillWidth: true }
                        }
                    }
                }
                Text { text: "WHAT DESKDEAR CAN DO"; color: theme.muted; font.pixelSize: 10; font.letterSpacing: 1.4; Layout.topMargin: 12 }
                RowLayout {
                    Layout.fillWidth: true
                    spacing: 14
                    Repeater {
                        model: [["Workspace", "Read and write inside approved folders", theme.gold], ["Health", "Report status and connectivity", theme.mint], ["Approvals", "Ask before sensitive actions", theme.blueGray]]
                        delegate: Rectangle {
                            required property var modelData
                            Layout.fillWidth: true
                            Layout.preferredHeight: 122
                            radius: 13
                            color: theme.panel
                            border.color: theme.border
                            Column {
                                anchors.fill: parent
                                anchors.margins: 16
                                spacing: 8
                                Text { text: modelData[0]; color: modelData[2]; font.pixelSize: 14; font.bold: true }
                                Text { text: modelData[1]; color: theme.muted; font.pixelSize: 11; wrapMode: Text.WordWrap; width: parent.width }
                            }
                        }
                    }
                }
            }
        }
    }

    Component {
        id: placeholderPage
        ColumnLayout {
            spacing: 12
            Text { text: "This surface is coming next"; color: theme.text; font.pixelSize: 24; font.bold: true }
            Text { text: "The shared shell is ready. The next build connects this page to the local agent state and audit stream."; color: theme.muted; font.pixelSize: 14; wrapMode: Text.WordWrap; Layout.fillWidth: true }
        }
    }
}
