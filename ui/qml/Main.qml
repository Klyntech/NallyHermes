import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// DeskDear desktop shell
// Visual system aligned with android-native-app Theme.kt (NallyHermesTheme)
// Layout remains a desktop command center: left rail / center / right context

ApplicationWindow {
    id: window
    visible: true
    width: 1280
    height: 800
    minimumWidth: 980
    minimumHeight: 640
    title: "DeskDear"
    color: theme.canvas

    /*
     * Product tokens from android/.../ui/theme/Theme.kt
     * darkColorScheme + hard canvas used on login/shell surfaces.
     */
    QtObject {
        id: theme
        // Surfaces
        readonly property color canvas: "#0B0C0B"          // hard app canvas (NallyHermesApp)
        readonly property color background: "#191A18"     // Material background
        readonly property color panel: "#232521"          // surface
        readonly property color raised: "#2B2D28"         // surfaceVariant
        readonly property color primaryContainer: "#343B30"
        readonly property color border: "#3D403A"         // outlineVariant
        readonly property color outline: "#777A72"

        // Text
        readonly property color text: "#F1F2ED"           // onBackground / onSurface
        readonly property color muted: "#A7AAA3"          // onSurfaceVariant / secondary

        // Accents (Android primary family is sage; map DeskDear signals onto it)
        readonly property color primary: "#A7B09A"        // primary (sage)
        readonly property color onPrimary: "#252B20"
        readonly property color success: "#A7B09A"        // connected / healthy (same family as primary)
        readonly property color attention: "#C9C4A8"      // warm neutral attention (desktop “gold” role)
        readonly property color danger: "#F2B8B5"         // error
        readonly property color onDanger: "#601410"
        readonly property color info: "#A7AAA3"           // neutral info

        // Radii / spacing (shared product rhythm)
        readonly property int radiusPanel: 14
        readonly property int radiusControl: 10
        readonly property int radiusPill: 999
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
        radius: theme.radiusPill
        color: Qt.rgba(accent.r, accent.g, accent.b, 0.14)
        border.color: Qt.rgba(accent.r, accent.g, accent.b, 0.32)
        Text {
            id: pillText
            anchors.centerIn: parent
            text: parent.label
            color: parent.accent
            font.pixelSize: 12
            font.weight: Font.DemiBold
            font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
        }
    }

    component NavItem: Rectangle {
        required property string label
        required property string glyph
        required property int pageIndex
        Layout.fillWidth: true
        Layout.preferredHeight: 42
        radius: 9
        color: selectedPage === pageIndex ? theme.raised : "transparent"
        border.color: selectedPage === pageIndex ? theme.border : "transparent"

        RowLayout {
            anchors.fill: parent
            anchors.leftMargin: 12
            anchors.rightMargin: 12
            spacing: 11
            Text {
                text: glyph
                color: selectedPage === pageIndex ? theme.primary : theme.muted
                font.pixelSize: 16
            }
            Text {
                text: label
                color: selectedPage === pageIndex ? theme.text : theme.muted
                font.pixelSize: 13
                font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                Layout.fillWidth: true
            }
        }
        MouseArea {
            anchors.fill: parent
            cursorShape: Qt.PointingHandCursor
            onClicked: selectedPage = pageIndex
        }
    }

    RowLayout {
        anchors.fill: parent
        spacing: 0

        // ── Left rail ───────────────────────────────────────────────
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
                        color: theme.primary
                        Text {
                            anchors.centerIn: parent
                            text: "D"
                            color: theme.onPrimary
                            font.pixelSize: 18
                            font.bold: true
                            font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                        }
                    }
                    Column {
                        spacing: 1
                        Text {
                            text: "DeskDear"
                            color: theme.text
                            font.pixelSize: 16
                            font.bold: true
                            font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                        }
                        Text {
                            text: "DESKTOP AGENT"
                            color: theme.muted
                            font.pixelSize: 9
                            font.letterSpacing: 1.2
                            font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                        }
                    }
                }

                Item { Layout.preferredHeight: 42 }

                Text {
                    text: "THIS COMPUTER"
                    color: theme.muted
                    font.pixelSize: 10
                    font.letterSpacing: 1.4
                    font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                }
                RowLayout {
                    Layout.fillWidth: true
                    Layout.topMargin: 10
                    spacing: 8
                    StatusDot { dotColor: theme.success }
                    Text {
                        text: "Nigeria desktop"
                        color: theme.text
                        font.pixelSize: 13
                        Layout.fillWidth: true
                        elide: Text.ElideRight
                        font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                    }
                }

                Item { Layout.preferredHeight: 30 }

                NavItem { label: "Overview"; glyph: "◈"; pageIndex: 0 }
                NavItem { label: "Activity"; glyph: "◌"; pageIndex: 1 }
                NavItem { label: "Permissions"; glyph: "◇"; pageIndex: 2 }
                NavItem { label: "Settings"; glyph: "⚙"; pageIndex: 3 }

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
                        Text {
                            text: "NALLY PLANS"
                            color: theme.muted
                            font.pixelSize: 9
                            font.letterSpacing: 1.2
                            font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                        }
                        Text {
                            text: "DESKDEAR CHECKS"
                            color: theme.primary
                            font.pixelSize: 11
                            font.bold: true
                            font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                        }
                        Text {
                            text: "YOU APPROVE"
                            color: theme.success
                            font.pixelSize: 11
                            font.bold: true
                            font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                        }
                    }
                }
            }
        }

        // ── Center surface ──────────────────────────────────────────
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
                        text: ["Overview", "Activity", "Permissions", "Settings"][selectedPage]
                        color: theme.text
                        font.pixelSize: 27
                        font.weight: Font.DemiBold
                        font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                        Layout.fillWidth: true
                    }
                    Pill { label: "CONNECTED"; accent: theme.success }
                    Button {
                        text: "Open pairing"
                        flat: true
                        contentItem: Text {
                            text: parent.text
                            color: theme.primary
                            font.pixelSize: 12
                            font.bold: true
                            font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                        }
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

        // ── Right context column ────────────────────────────────────
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

                Text {
                    text: "CURRENT STATE"
                    color: theme.muted
                    font.pixelSize: 10
                    font.letterSpacing: 1.4
                    font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                }

                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 176
                    radius: theme.radiusPanel
                    color: theme.raised
                    border.color: theme.border
                    Column {
                        anchors.fill: parent
                        anchors.margins: 18
                        spacing: 12
                        Row {
                            spacing: 9
                            StatusDot { dotColor: theme.success; anchors.verticalCenter: parent.verticalCenter }
                            Text {
                                text: "Waiting for tasks"
                                color: theme.text
                                font.pixelSize: 15
                                font.bold: true
                                font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                            }
                        }
                        Text {
                            text: "No active control session"
                            color: theme.muted
                            font.pixelSize: 12
                            font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                        }
                        Rectangle { width: parent.width; height: 1; color: theme.border }
                        Text {
                            text: "Last heartbeat"
                            color: theme.muted
                            font.pixelSize: 11
                            font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                        }
                        Text {
                            text: "Just now"
                            color: theme.text
                            font.pixelSize: 13
                            font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                        }
                    }
                }

                Text {
                    text: "RECENT ACTIVITY"
                    color: theme.muted
                    font.pixelSize: 10
                    font.letterSpacing: 1.4
                    Layout.topMargin: 12
                    font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                }

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 13
                    Repeater {
                        model: [
                            ["Connected to Nally", "Just now", theme.success],
                            ["Permission policy loaded", "2 min ago", theme.info],
                            ["Agent self-test passed", "5 min ago", theme.attention]
                        ]
                        delegate: RowLayout {
                            required property var modelData
                            Layout.fillWidth: true
                            spacing: 10
                            StatusDot { dotColor: modelData[2]; width: 7; height: 7 }
                            ColumnLayout {
                                Layout.fillWidth: true
                                Text {
                                    text: modelData[0]
                                    color: theme.text
                                    font.pixelSize: 12
                                    elide: Text.ElideRight
                                    Layout.fillWidth: true
                                    font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                                }
                                Text {
                                    text: modelData[1]
                                    color: theme.muted
                                    font.pixelSize: 10
                                    font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                                }
                            }
                        }
                    }
                }

                Item { Layout.fillHeight: true }

                Button {
                    Layout.fillWidth: true
                    text: "Stop all sessions"
                    contentItem: Text {
                        text: parent.text
                        color: theme.danger
                        horizontalAlignment: Text.AlignHCenter
                        font.pixelSize: 12
                        font.bold: true
                        font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                    }
                    background: Rectangle {
                        radius: theme.radiusControl
                        color: Qt.rgba(theme.danger.r, theme.danger.g, theme.danger.b, 0.10)
                        border.color: Qt.rgba(theme.danger.r, theme.danger.g, theme.danger.b, 0.32)
                    }
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

                Text {
                    text: "DESKDEAR / HOME DESKTOP"
                    color: theme.primary
                    font.pixelSize: 10
                    font.letterSpacing: 1.5
                    font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                }
                Text {
                    text: "Your computer is ready"
                    color: theme.text
                    font.pixelSize: 34
                    font.weight: Font.DemiBold
                    font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                }
                Text {
                    text: "Nally can request approved work here. DeskDear checks every operation locally before it runs."
                    color: theme.muted
                    font.pixelSize: 14
                    wrapMode: Text.WordWrap
                    Layout.fillWidth: true
                    font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                }

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
                            Text {
                                text: "Connection"
                                color: theme.muted
                                font.pixelSize: 12
                                font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                            }
                            RowLayout {
                                spacing: 10
                                StatusDot { dotColor: theme.success; width: 11; height: 11 }
                                Text {
                                    text: "Connected"
                                    color: theme.text
                                    font.pixelSize: 23
                                    font.bold: true
                                    font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                                }
                            }
                            Text {
                                text: "Outbound session is healthy"
                                color: theme.success
                                font.pixelSize: 12
                                font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                            }
                            Text {
                                text: "This device is waiting for an approved task."
                                color: theme.muted
                                font.pixelSize: 12
                                font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                            }
                        }
                        Rectangle { Layout.preferredWidth: 1; Layout.fillHeight: true; color: theme.border }
                        ColumnLayout {
                            Layout.preferredWidth: 180
                            Text {
                                text: "SESSION"
                                color: theme.muted
                                font.pixelSize: 10
                                font.letterSpacing: 1.2
                                font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                            }
                            Text {
                                text: "Inactive"
                                color: theme.text
                                font.pixelSize: 15
                                font.bold: true
                                font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                            }
                            Text {
                                text: "No permissions in use"
                                color: theme.muted
                                font.pixelSize: 11
                                wrapMode: Text.WordWrap
                                Layout.fillWidth: true
                                font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                            }
                        }
                    }
                }

                Text {
                    text: "WHAT DESKDEAR CAN DO"
                    color: theme.muted
                    font.pixelSize: 10
                    font.letterSpacing: 1.4
                    Layout.topMargin: 12
                    font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                }

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 14
                    Repeater {
                        model: [
                            ["Workspace", "Read and write inside approved folders", theme.primary],
                            ["Health", "Report status and connectivity", theme.success],
                            ["Approvals", "Ask before sensitive actions", theme.info]
                        ]
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
                                Text {
                                    text: modelData[0]
                                    color: modelData[2]
                                    font.pixelSize: 14
                                    font.bold: true
                                    font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                                }
                                Text {
                                    text: modelData[1]
                                    color: theme.muted
                                    font.pixelSize: 11
                                    wrapMode: Text.WordWrap
                                    width: parent.width
                                    font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
                                }
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
            Text {
                text: "This surface is coming next"
                color: theme.text
                font.pixelSize: 24
                font.bold: true
                font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
            }
            Text {
                text: "The shared shell is ready. The next build connects this page to the local agent state and audit stream."
                color: theme.muted
                font.pixelSize: 14
                wrapMode: Text.WordWrap
                Layout.fillWidth: true
                font.family: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
            }
        }
    }
}
