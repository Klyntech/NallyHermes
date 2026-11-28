import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Shapes

// DeskDear desktop shell — Lucide icons (ISC), aligned with Android icons-lucide-android

ApplicationWindow {
    id: window
    visible: true
    width: 1280
    height: 800
    minimumWidth: 1020
    minimumHeight: 680
    title: "DeskDear"
    color: theme.canvas

    QtObject {
        id: theme
        readonly property color canvas: "#0B0C0B"
        readonly property color background: "#191A18"
        readonly property color panel: "#232521"
        readonly property color raised: "#2B2D28"
        readonly property color primaryContainer: "#343B30"
        readonly property color border: "#3D403A"
        readonly property color outline: "#777A72"
        readonly property color text: "#F1F2ED"
        readonly property color muted: "#A7AAA3"
        readonly property color primary: "#A7B09A"
        readonly property color primaryForeground: "#252B20"
        readonly property color success: "#A7B09A"
        readonly property color attention: "#C9C4A8"
        readonly property color danger: "#F2B8B5"
        readonly property color dangerForeground: "#601410"
        readonly property color info: "#A7AAA3"
        readonly property int radiusPanel: 14
        readonly property int radiusControl: 10
        readonly property int radiusPill: 999
        readonly property string fontFamily: "Segoe UI, Ubuntu, Cantarell, Noto Sans, sans-serif"
    }

    property int selectedPage: 0
    property bool pairingOpen: false
    readonly property var pageTitles: ["Overview", "Activity", "Permissions", "Settings"]

    component StatusDot: Rectangle {
        required property color dotColor
        width: 9; height: 9; radius: 5; color: dotColor
    }

    component Pill: Rectangle {
        required property string label
        required property color accent
        implicitWidth: pillText.implicitWidth + 22
        implicitHeight: 28
        radius: theme.radiusPill
        color: Qt.rgba(accent.r, accent.g, accent.b, 0.14)
        border.color: Qt.rgba(accent.r, accent.g, accent.b, 0.30)
        Text {
            id: pillText
            anchors.centerIn: parent
            text: parent.label
            color: parent.accent
            font.pixelSize: 11
            font.weight: Font.DemiBold
            font.family: theme.fontFamily
            font.letterSpacing: 0.4
        }
    }

    // Lucide (ISC) — same family as Android icons-lucide-android
    component LucideIcon: Item {
        id: iconRoot
        property string name: "activity"
        property bool active: false
        property real size: 18
        property color stroke: active ? theme.primary : theme.muted
        width: size; height: size
        readonly property var paths: ({
            "layout-dashboard": ["M3 3h7v9H3z", "M14 3h7v5h-7z", "M14 12h7v9h-7z", "M3 16h7v5H3z"],
            "activity": ["M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"],
            "shield": ["M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"],
            "settings": ["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"],
            "monitor": ["M8 21h8", "M12 17v4", "M3 3h18v14H3z"],
            "link-2": ["M9 17H7A5 5 0 0 1 7 7h2", "M15 7h2a5 5 0 1 1 0 10h-2", "M8 12h8"],
            "circle-stop": ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M9 9h6v6H9z"],
            "check": ["M20 6 9 17l-5-5"]
        })
        Shape {
            anchors.fill: parent
            preferredRendererType: Shape.CurveRenderer
            transformOrigin: Item.TopLeft
            scale: iconRoot.size / 24
            Repeater {
                model: iconRoot.paths[iconRoot.name] || []
                ShapePath {
                    strokeWidth: 1.75
                    strokeColor: iconRoot.stroke
                    fillColor: "transparent"
                    capStyle: ShapePath.RoundCap
                    joinStyle: ShapePath.RoundJoin
                    PathSvg { path: modelData }
                }
            }
        }
    }

    component NavItem: Rectangle {
        required property string label
        required property string icon
        required property int pageIndex
        property bool hovered: false
        Layout.fillWidth: true
        Layout.preferredHeight: 40
        radius: 9
        color: selectedPage === pageIndex ? theme.raised : (hovered ? Qt.rgba(1, 1, 1, 0.04) : "transparent")
        border.color: selectedPage === pageIndex ? theme.border : "transparent"
        RowLayout {
            anchors.fill: parent
            anchors.leftMargin: 12
            anchors.rightMargin: 12
            spacing: 11
            LucideIcon {
                name: icon
                active: selectedPage === pageIndex
                size: 17
                Layout.alignment: Qt.AlignVCenter
            }
            Text {
                text: label
                color: selectedPage === pageIndex ? theme.text : theme.muted
                font.pixelSize: 13
                font.family: theme.fontFamily
                Layout.fillWidth: true
            }
        }
        MouseArea {
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onEntered: parent.hovered = true
            onExited: parent.hovered = false
            onClicked: { selectedPage = pageIndex; pairingOpen = false }
        }
    }

    component SectionLabel: Text {
        color: theme.muted
        font.pixelSize: 10
        font.letterSpacing: 1.3
        font.family: theme.fontFamily
        font.weight: Font.Medium
    }
    component BodyText: Text {
        color: theme.muted
        font.pixelSize: 13
        font.family: theme.fontFamily
        wrapMode: Text.WordWrap
    }
    component TitleText: Text {
        color: theme.text
        font.pixelSize: 28
        font.weight: Font.DemiBold
        font.family: theme.fontFamily
    }
    component Card: Rectangle {
        radius: theme.radiusPanel
        color: theme.panel
        border.color: theme.border
        border.width: 1
    }

    RowLayout {
        anchors.fill: parent
        spacing: 0

        Rectangle {
            Layout.fillHeight: true
            Layout.preferredWidth: 228
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
                        width: 32; height: 32; radius: 10; color: theme.primary
                        Text {
                            anchors.centerIn: parent
                            text: "D"
                            color: theme.primaryForeground
                            font.pixelSize: 17
                            font.bold: true
                            font.family: theme.fontFamily
                        }
                    }
                    Column {
                        spacing: 1
                        Text { text: "DeskDear"; color: theme.text; font.pixelSize: 15; font.bold: true; font.family: theme.fontFamily }
                        Text { text: "DESKTOP AGENT"; color: theme.muted; font.pixelSize: 9; font.letterSpacing: 1.1; font.family: theme.fontFamily }
                    }
                }
                Item { Layout.preferredHeight: 36 }
                SectionLabel { text: "THIS COMPUTER" }
                RowLayout {
                    Layout.fillWidth: true
                    Layout.topMargin: 10
                    spacing: 8
                    LucideIcon { name: "monitor"; active: pairing.paired; size: 15; Layout.alignment: Qt.AlignVCenter }
                    StatusDot { dotColor: pairing.paired ? theme.success : theme.attention }
                    Text {
                        text: "Nigeria desktop"
                        color: theme.text
                        font.pixelSize: 13
                        Layout.fillWidth: true
                        elide: Text.ElideRight
                        font.family: theme.fontFamily
                    }
                }
                Item { Layout.preferredHeight: 28 }
                NavItem { label: "Overview"; icon: "layout-dashboard"; pageIndex: 0 }
                NavItem { label: "Activity"; icon: "activity"; pageIndex: 1 }
                NavItem { label: "Permissions"; icon: "shield"; pageIndex: 2 }
                NavItem { label: "Settings"; icon: "settings"; pageIndex: 3 }
                Item { Layout.fillHeight: true }
                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 86
                    radius: 12
                    color: theme.raised
                    border.color: theme.border
                    Column {
                        anchors.fill: parent
                        anchors.margins: 12
                        spacing: 5
                        Text { text: "NALLY PLANS"; color: theme.muted; font.pixelSize: 9; font.letterSpacing: 1.1; font.family: theme.fontFamily }
                        Text { text: "DESKDEAR CHECKS"; color: theme.primary; font.pixelSize: 11; font.bold: true; font.family: theme.fontFamily }
                        Text { text: "YOU APPROVE"; color: theme.success; font.pixelSize: 11; font.bold: true; font.family: theme.fontFamily }
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
                anchors.margins: 36
                spacing: 20
                RowLayout {
                    Layout.fillWidth: true
                    spacing: 12
                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 4
                        SectionLabel {
                            text: pairingOpen ? "TELEGRAM PAIRING" : "DESKDEAR / HOME DESKTOP"
                            visible: pairingOpen || selectedPage === 0
                        }
                        TitleText {
                            text: pairingOpen ? "Connect this desktop" : pageTitles[selectedPage]
                            Layout.fillWidth: true
                        }
                    }
                    Pill {
                        label: pairing.paired ? "PAIRED" : "NOT PAIRED"
                        accent: pairing.paired ? theme.success : theme.attention
                    }
                    Button {
                        text: pairingOpen ? "Close" : "Open pairing"
                        flat: true
                        contentItem: Text {
                            text: parent.text
                            color: theme.primary
                            font.pixelSize: 12
                            font.bold: true
                            font.family: theme.fontFamily
                        }
                        background: Rectangle {
                            radius: 8
                            color: parent.hovered ? Qt.rgba(theme.primary.r, theme.primary.g, theme.primary.b, 0.10) : "transparent"
                        }
                        onClicked: pairingOpen = !pairingOpen
                    }
                }
                Loader {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    sourceComponent: pairingOpen ? pairingPage
                        : (selectedPage === 0 ? overviewPage
                           : selectedPage === 1 ? activityPage
                           : selectedPage === 2 ? permissionsPage
                           : settingsPage)
                }
            }
        }

        Rectangle {
            Layout.fillHeight: true
            Layout.preferredWidth: 300
            color: theme.panel
            border.color: theme.border
            border.width: 1
            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 22
                spacing: 16
                SectionLabel { text: "CURRENT STATE" }
                Card {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 168
                    Column {
                        anchors.fill: parent
                        anchors.margins: 16
                        spacing: 10
                        Row {
                            spacing: 9
                            StatusDot {
                                dotColor: pairing.paired ? theme.success : theme.attention
                                anchors.verticalCenter: parent.verticalCenter
                            }
                            Text {
                                text: pairing.paired ? "Ready for tasks" : "Waiting to pair"
                                color: theme.text
                                font.pixelSize: 14
                                font.bold: true
                                font.family: theme.fontFamily
                            }
                        }
                        Text {
                            text: pairing.paired ? "Linked to your Nally account" : "No active control session"
                            color: theme.muted
                            font.pixelSize: 12
                            font.family: theme.fontFamily
                        }
                        Rectangle { width: parent.width; height: 1; color: theme.border }
                        Text { text: "Last heartbeat"; color: theme.muted; font.pixelSize: 11; font.family: theme.fontFamily }
                        Text { text: "Just now"; color: theme.text; font.pixelSize: 13; font.family: theme.fontFamily }
                    }
                }
                SectionLabel { text: "RECENT ACTIVITY"; Layout.topMargin: 4 }
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 12
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
                                spacing: 1
                                Text {
                                    text: modelData[0]
                                    color: theme.text
                                    font.pixelSize: 12
                                    elide: Text.ElideRight
                                    Layout.fillWidth: true
                                    font.family: theme.fontFamily
                                }
                                Text {
                                    text: modelData[1]
                                    color: theme.muted
                                    font.pixelSize: 10
                                    font.family: theme.fontFamily
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
                        font.family: theme.fontFamily
                    }
                    background: Rectangle {
                        radius: theme.radiusControl
                        color: parent.hovered
                               ? Qt.rgba(theme.danger.r, theme.danger.g, theme.danger.b, 0.16)
                               : Qt.rgba(theme.danger.r, theme.danger.g, theme.danger.b, 0.10)
                        border.color: Qt.rgba(theme.danger.r, theme.danger.g, theme.danger.b, 0.30)
                    }
                }
            }
        }
    }

    Component {
        id: overviewPage
        Flickable {
            contentHeight: overviewColumn.implicitHeight + 8
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            ColumnLayout {
                id: overviewColumn
                width: parent.width
                spacing: 18
                BodyText {
                    text: "Nally can request approved work here. DeskDear checks every operation locally before it runs."
                    Layout.fillWidth: true
                    font.pixelSize: 14
                }
                Card {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 150
                    RowLayout {
                        anchors.fill: parent
                        anchors.margins: 20
                        spacing: 18
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 6
                            Text { text: "Connection"; color: theme.muted; font.pixelSize: 12; font.family: theme.fontFamily }
                            RowLayout {
                                spacing: 10
                                StatusDot { dotColor: pairing.paired ? theme.success : theme.attention; width: 11; height: 11 }
                                Text {
                                    text: pairing.paired ? "Paired" : "Not paired"
                                    color: theme.text
                                    font.pixelSize: 22
                                    font.bold: true
                                    font.family: theme.fontFamily
                                }
                            }
                            Text {
                                text: pairing.paired ? "Outbound session is healthy" : "Pair with Telegram to link this computer"
                                color: pairing.paired ? theme.success : theme.muted
                                font.pixelSize: 12
                                font.family: theme.fontFamily
                                wrapMode: Text.WordWrap
                                Layout.fillWidth: true
                            }
                        }
                        Rectangle { Layout.preferredWidth: 1; Layout.fillHeight: true; color: theme.border }
                        ColumnLayout {
                            Layout.preferredWidth: 170
                            spacing: 6
                            SectionLabel { text: "SESSION" }
                            Text { text: "Inactive"; color: theme.text; font.pixelSize: 15; font.bold: true; font.family: theme.fontFamily }
                            BodyText { text: "No permissions in use"; Layout.fillWidth: true; font.pixelSize: 11 }
                        }
                    }
                }
                SectionLabel { text: "WHAT DESKDEAR CAN DO"; Layout.topMargin: 4 }
                RowLayout {
                    Layout.fillWidth: true
                    spacing: 12
                    Repeater {
                        model: [
                            ["Workspace", "Read and write inside approved folders", theme.primary],
                            ["Health", "Report status and connectivity", theme.success],
                            ["Approvals", "Ask before sensitive actions", theme.info]
                        ]
                        delegate: Card {
                            required property var modelData
                            Layout.fillWidth: true
                            Layout.preferredHeight: 118
                            Column {
                                anchors.fill: parent
                                anchors.margins: 16
                                spacing: 8
                                Text { text: modelData[0]; color: modelData[2]; font.pixelSize: 13; font.bold: true; font.family: theme.fontFamily }
                                Text { text: modelData[1]; color: theme.muted; font.pixelSize: 12; wrapMode: Text.WordWrap; width: parent.width; font.family: theme.fontFamily }
                            }
                        }
                    }
                }
                Button {
                    visible: !pairing.paired
                    text: "Pair this desktop"
                    Layout.topMargin: 4
                    contentItem: Text {
                        text: parent.text
                        color: theme.primaryForeground
                        font.pixelSize: 13
                        font.bold: true
                        font.family: theme.fontFamily
                        horizontalAlignment: Text.AlignHCenter
                    }
                    background: Rectangle {
                        implicitWidth: 160; implicitHeight: 38; radius: 9
                        color: parent.hovered ? Qt.lighter(theme.primary, 1.08) : theme.primary
                    }
                    onClicked: pairingOpen = true
                }
            }
        }
    }

    Component {
        id: pairingPage
        Flickable {
            contentHeight: pairingColumn.implicitHeight + 8
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            ColumnLayout {
                id: pairingColumn
                width: Math.min(parent.width, 560)
                spacing: 16
                BodyText {
                    text: "In a private Telegram chat with Nally, send /pairdesktop. Enter the one-time code here within five minutes."
                    Layout.fillWidth: true
                    font.pixelSize: 14
                }
                Card {
                    Layout.fillWidth: true
                    implicitHeight: pairingInner.implicitHeight + 40
                    ColumnLayout {
                        id: pairingInner
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.top: parent.top
                        anchors.margins: 20
                        spacing: 14
                        SectionLabel { text: "ONE-TIME CODE" }
                        TextField {
                            id: pairingCode
                            Layout.fillWidth: true
                            Layout.preferredHeight: 48
                            placeholderText: "10-digit code"
                            inputMethodHints: Qt.ImhDigitsOnly
                            validator: RegularExpressionValidator { regularExpression: /[0-9]{0,10}/ }
                            color: theme.text
                            placeholderTextColor: theme.outline
                            font.pixelSize: 22
                            font.letterSpacing: 2
                            font.family: theme.fontFamily
                            leftPadding: 14; rightPadding: 14
                            background: Rectangle {
                                radius: 10
                                color: theme.raised
                                border.width: 1
                                border.color: pairingCode.activeFocus ? theme.primary : theme.border
                            }
                            Keys.onReturnPressed: {
                                if (pairingCode.text.length === 10 && !pairing.busy)
                                    pairing.submitCode(pairingCode.text)
                            }
                        }
                        RowLayout {
                            Layout.fillWidth: true
                            spacing: 12
                            Button {
                                text: pairing.busy ? "Pairing…" : "Submit code"
                                enabled: !pairing.busy && pairingCode.text.length === 10
                                contentItem: Text {
                                    text: parent.text
                                    color: parent.enabled ? theme.primaryForeground : theme.muted
                                    horizontalAlignment: Text.AlignHCenter
                                    font.pixelSize: 13
                                    font.bold: true
                                    font.family: theme.fontFamily
                                }
                                background: Rectangle {
                                    implicitWidth: 132; implicitHeight: 38; radius: 9
                                    color: {
                                        if (!parent.enabled) return theme.border
                                        if (parent.hovered) return Qt.lighter(theme.primary, 1.08)
                                        return theme.primary
                                    }
                                }
                                onClicked: pairing.submitCode(pairingCode.text)
                            }
                            Text {
                                text: pairing.status
                                color: pairing.paired ? theme.success
                                       : (pairing.status.indexOf("invalid") >= 0
                                          || pairing.status.indexOf("not configured") >= 0
                                          || pairing.status.indexOf("could not") >= 0
                                          ? theme.danger : theme.muted)
                                font.pixelSize: 12
                                wrapMode: Text.WordWrap
                                Layout.fillWidth: true
                                font.family: theme.fontFamily
                            }
                        }
                    }
                }
                RowLayout {
                    Layout.fillWidth: true
                    spacing: 10
                    Repeater {
                        model: [["1", "Open Telegram"], ["2", "Send /pairdesktop"], ["3", "Paste code here"]]
                        delegate: Card {
                            required property var modelData
                            Layout.fillWidth: true
                            Layout.preferredHeight: 64
                            RowLayout {
                                anchors.fill: parent
                                anchors.margins: 12
                                spacing: 10
                                Rectangle {
                                    width: 26; height: 26; radius: 13; color: theme.primaryContainer
                                    Text {
                                        anchors.centerIn: parent
                                        text: modelData[0]
                                        color: theme.primary
                                        font.bold: true
                                        font.pixelSize: 12
                                        font.family: theme.fontFamily
                                    }
                                }
                                Text {
                                    text: modelData[1]
                                    color: theme.text
                                    font.pixelSize: 12
                                    font.family: theme.fontFamily
                                    Layout.fillWidth: true
                                    wrapMode: Text.WordWrap
                                }
                            }
                        }
                    }
                }
                Button {
                    text: "Back to overview"
                    flat: true
                    contentItem: Text {
                        text: parent.text
                        color: theme.primary
                        font.pixelSize: 12
                        font.bold: true
                        font.family: theme.fontFamily
                    }
                    background: Rectangle { color: "transparent" }
                    onClicked: pairingOpen = false
                }
            }
        }
    }

    Component {
        id: activityPage
        Flickable {
            contentHeight: activityColumn.implicitHeight + 8
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            ColumnLayout {
                id: activityColumn
                width: parent.width
                spacing: 14
                BodyText {
                    text: "Local audit of agent requests and outcomes. Live streaming connects in a later build."
                    Layout.fillWidth: true
                }
                Repeater {
                    model: [
                        ["Self-test", "Agent core checks passed", "5 min ago", theme.success],
                        ["Policy load", "Default permission set applied", "2 min ago", theme.info],
                        ["Heartbeat", "Control plane reachability OK", "Just now", theme.primary]
                    ]
                    delegate: Card {
                        required property var modelData
                        Layout.fillWidth: true
                        Layout.preferredHeight: 78
                        RowLayout {
                            anchors.fill: parent
                            anchors.margins: 16
                            spacing: 14
                            StatusDot { dotColor: modelData[3]; width: 10; height: 10 }
                            ColumnLayout {
                                Layout.fillWidth: true
                                spacing: 2
                                Text { text: modelData[0]; color: theme.text; font.pixelSize: 14; font.bold: true; font.family: theme.fontFamily }
                                Text { text: modelData[1]; color: theme.muted; font.pixelSize: 12; font.family: theme.fontFamily }
                            }
                            Text { text: modelData[2]; color: theme.outline; font.pixelSize: 11; font.family: theme.fontFamily }
                        }
                    }
                }
            }
        }
    }

    Component {
        id: permissionsPage
        Flickable {
            contentHeight: permColumn.implicitHeight + 8
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            ColumnLayout {
                id: permColumn
                width: parent.width
                spacing: 14
                BodyText {
                    text: "DeskDear starts fail-closed. Capabilities stay denied until you explicitly allow them."
                    Layout.fillWidth: true
                }
                Repeater {
                    model: [
                        ["Workspace files", "Read / write approved folders only", "Denied", theme.danger],
                        ["Shell commands", "Run local processes", "Denied", theme.danger],
                        ["Network tools", "Outbound fetches on your behalf", "Denied", theme.danger],
                        ["Screen capture", "Read pixels from displays", "Denied", theme.danger],
                        ["Clipboard", "Read or write clipboard", "Denied", theme.danger]
                    ]
                    delegate: Card {
                        required property var modelData
                        Layout.fillWidth: true
                        Layout.preferredHeight: 72
                        RowLayout {
                            anchors.fill: parent
                            anchors.margins: 16
                            spacing: 12
                            ColumnLayout {
                                Layout.fillWidth: true
                                spacing: 2
                                Text { text: modelData[0]; color: theme.text; font.pixelSize: 14; font.bold: true; font.family: theme.fontFamily }
                                Text { text: modelData[1]; color: theme.muted; font.pixelSize: 12; font.family: theme.fontFamily }
                            }
                            Pill { label: modelData[2].toUpperCase(); accent: modelData[3] }
                        }
                    }
                }
            }
        }
    }

    Component {
        id: settingsPage
        Flickable {
            contentHeight: settingsColumn.implicitHeight + 8
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            ColumnLayout {
                id: settingsColumn
                width: parent.width
                spacing: 14
                BodyText {
                    text: "Local agent preferences. Control-plane URL defaults to the production host."
                    Layout.fillWidth: true
                }
                Card {
                    Layout.fillWidth: true
                    implicitHeight: settingsInner.implicitHeight + 36
                    ColumnLayout {
                        id: settingsInner
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.top: parent.top
                        anchors.margins: 18
                        spacing: 14
                        RowLayout {
                            Layout.fillWidth: true
                            Text { text: "Version"; color: theme.text; font.pixelSize: 13; font.family: theme.fontFamily; Layout.fillWidth: true }
                            Text { text: "0.1.0"; color: theme.muted; font.pixelSize: 13; font.family: theme.fontFamily }
                        }
                        Rectangle { Layout.fillWidth: true; height: 1; color: theme.border }
                        RowLayout {
                            Layout.fillWidth: true
                            Text { text: "Pairing status"; color: theme.text; font.pixelSize: 13; font.family: theme.fontFamily; Layout.fillWidth: true }
                            Text {
                                text: pairing.paired ? "Paired" : "Not paired"
                                color: pairing.paired ? theme.success : theme.attention
                                font.pixelSize: 13
                                font.bold: true
                                font.family: theme.fontFamily
                            }
                        }
                        Rectangle { Layout.fillWidth: true; height: 1; color: theme.border }
                        RowLayout {
                            Layout.fillWidth: true
                            Text { text: "Control plane"; color: theme.text; font.pixelSize: 13; font.family: theme.fontFamily; Layout.fillWidth: true }
                            Text { text: "nally.onrender.com"; color: theme.muted; font.pixelSize: 13; font.family: theme.fontFamily }
                        }
                        Rectangle { Layout.fillWidth: true; height: 1; color: theme.border }
                        RowLayout {
                            Layout.fillWidth: true
                            Text { text: "Execution policy"; color: theme.text; font.pixelSize: 13; font.family: theme.fontFamily; Layout.fillWidth: true }
                            Text { text: "Fail-closed"; color: theme.primary; font.pixelSize: 13; font.bold: true; font.family: theme.fontFamily }
                        }
                    }
                }
                BodyText {
                    text: "Override the endpoint with the DESKDEAR_CONTROL_URL environment variable if you run a private control plane."
                    Layout.fillWidth: true
                    font.pixelSize: 12
                }
            }
        }
    }
}
