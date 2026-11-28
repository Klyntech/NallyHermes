import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

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

    // Live presence + permissions (session-local)
    property var heartbeatAt: new Date()
    property string heartbeatLabel: "—"
    property var activityEvents: []
    property var permissions: [
        { id: "workspace", title: "Workspace files", detail: "Read / write approved folders only", allowed: false },
        { id: "shell", title: "Shell commands", detail: "Run local processes", allowed: false },
        { id: "network", title: "Network tools", detail: "Outbound fetches on your behalf", allowed: false },
        { id: "screen", title: "Screen capture", detail: "Read pixels from displays", allowed: false },
        { id: "clipboard", title: "Clipboard", detail: "Read or write clipboard", allowed: false }
    ]

    function pushActivity(title, detail, accent) {
        var list = activityEvents.slice()
        list.unshift({ title: title, detail: detail || "", accent: accent || theme.info, at: new Date() })
        if (list.length > 12) list = list.slice(0, 12)
        activityEvents = list
    }
    function refreshHeartbeatLabel() {
        if (!pairing.paired) { heartbeatLabel = "Not paired"; return }
        var ms = Date.now() - heartbeatAt.getTime()
        if (ms < 8000) heartbeatLabel = "Just now"
        else if (ms < 60000) heartbeatLabel = Math.floor(ms / 1000) + "s ago"
        else if (ms < 3600000) heartbeatLabel = Math.floor(ms / 60000) + " min ago"
        else heartbeatLabel = Math.floor(ms / 3600000) + " h ago"
    }
    function formatAge(d) {
        if (!d) return ""
        var ms = Date.now() - d.getTime()
        if (ms < 8000) return "Just now"
        if (ms < 60000) return Math.floor(ms / 1000) + "s ago"
        if (ms < 3600000) return Math.floor(ms / 60000) + " min ago"
        return Math.floor(ms / 3600000) + " h ago"
    }
    function grantAllPermissions() {
        var next = []
        for (var i = 0; i < permissions.length; ++i) {
            var p = permissions[i]
            next.push({ id: p.id, title: p.title, detail: p.detail, allowed: true })
        }
        permissions = next
        pushActivity("Permissions granted", "All capabilities allowed for this session", theme.success)
    }
    function setPermission(index, allowed) {
        var next = []
        for (var i = 0; i < permissions.length; ++i) {
            var p = permissions[i]
            next.push({ id: p.id, title: p.title, detail: p.detail, allowed: (i === index) ? allowed : p.allowed })
        }
        permissions = next
        var row = permissions[index]
        pushActivity(row.allowed ? ("Allowed: " + row.title) : ("Denied: " + row.title), "Local policy updated", row.allowed ? theme.success : theme.danger)
    }
    function allowedCount() {
        var n = 0
        for (var i = 0; i < permissions.length; ++i) if (permissions[i].allowed) n++
        return n
    }

    Timer {
        interval: 5000
        running: pairing.paired
        repeat: true
        onTriggered: { heartbeatAt = new Date(); refreshHeartbeatLabel(); activityEvents = activityEvents.slice() }
    }
    Timer {
        interval: 3000
        running: true
        repeat: true
        onTriggered: refreshHeartbeatLabel()
    }
    Connections {
        target: pairing
        function onPairedChanged() {
            if (pairing.paired) {
                heartbeatAt = new Date()
                refreshHeartbeatLabel()
                pushActivity("Paired with Nally", "Device linked to your account", theme.success)
                grantAllPermissions()
            } else {
                heartbeatLabel = "Not paired"
                pushActivity("Unpaired", "Session cleared", theme.attention)
            }
        }
    }
    Component.onCompleted: {
        pushActivity("Agent started", "DeskDear UI online", theme.info)
        if (pairing.paired) { heartbeatAt = new Date(); grantAllPermissions() }
        refreshHeartbeatLabel()
    }


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

    // Lucide-style icons via Canvas (no QtQuick.Shapes deploy dependency)
    component LucideIcon: Item {
        id: iconRoot
        property string name: "activity"
        property bool active: false
        property real size: 18
        property color stroke: active ? theme.primary : theme.muted
        width: size
        height: size

        Canvas {
            id: canvas
            anchors.fill: parent
            antialiasing: true
            renderStrategy: Canvas.Cooperative
            onPaint: {
                var ctx = getContext("2d")
                ctx.reset()
                ctx.clearRect(0, 0, width, height)
                ctx.strokeStyle = iconRoot.stroke
                ctx.lineWidth = Math.max(1.4, width / 14)
                ctx.lineCap = "round"
                ctx.lineJoin = "round"
                var s = width / 24
                ctx.scale(s, s)
                var n = iconRoot.name
                function rr(x, y, rw, rh, r) {
                    ctx.beginPath()
                    ctx.moveTo(x + r, y)
                    ctx.lineTo(x + rw - r, y)
                    ctx.quadraticCurveTo(x + rw, y, x + rw, y + r)
                    ctx.lineTo(x + rw, y + rh - r)
                    ctx.quadraticCurveTo(x + rw, y + rh, x + rw - r, y + rh)
                    ctx.lineTo(x + r, y + rh)
                    ctx.quadraticCurveTo(x, y + rh, x, y + rh - r)
                    ctx.lineTo(x, y + r)
                    ctx.quadraticCurveTo(x, y, x + r, y)
                    ctx.stroke()
                }
                if (n === "layout-dashboard") {
                    rr(3, 3, 8, 9, 1.5); rr(13, 3, 8, 5, 1.5)
                    rr(13, 11, 8, 10, 1.5); rr(3, 15, 8, 6, 1.5)
                } else if (n === "activity") {
                    ctx.beginPath()
                    ctx.moveTo(2, 12); ctx.lineTo(5, 12); ctx.lineTo(8.5, 5)
                    ctx.lineTo(12, 19); ctx.lineTo(15.5, 9); ctx.lineTo(19, 12); ctx.lineTo(22, 12)
                    ctx.stroke()
                } else if (n === "shield") {
                    ctx.beginPath()
                    ctx.moveTo(12, 3); ctx.lineTo(20, 6); ctx.lineTo(20, 12)
                    ctx.bezierCurveTo(20, 17, 16.5, 20.2, 12, 21.5)
                    ctx.bezierCurveTo(7.5, 20.2, 4, 17, 4, 12)
                    ctx.lineTo(4, 6); ctx.closePath(); ctx.stroke()
                } else if (n === "settings") {
                    ctx.beginPath(); ctx.arc(12, 12, 3, 0, Math.PI * 2); ctx.stroke()
                    for (var i = 0; i < 8; ++i) {
                        var a = (i / 8) * Math.PI * 2
                        ctx.beginPath()
                        ctx.moveTo(12 + Math.cos(a) * 6.2, 12 + Math.sin(a) * 6.2)
                        ctx.lineTo(12 + Math.cos(a) * 9.2, 12 + Math.sin(a) * 9.2)
                        ctx.stroke()
                    }
                } else if (n === "monitor") {
                    rr(3, 4, 18, 12, 1.5)
                    ctx.beginPath()
                    ctx.moveTo(8, 20); ctx.lineTo(16, 20)
                    ctx.moveTo(12, 16); ctx.lineTo(12, 20)
                    ctx.stroke()
                } else if (n === "check") {
                    ctx.beginPath()
                    ctx.moveTo(5, 12); ctx.lineTo(10, 17); ctx.lineTo(19, 6)
                    ctx.stroke()
                } else {
                    ctx.beginPath(); ctx.arc(12, 12, 7, 0, Math.PI * 2); ctx.stroke()
                }
            }
        }
        onNameChanged: canvas.requestPaint()
        onActiveChanged: canvas.requestPaint()
        onStrokeChanged: canvas.requestPaint()
        onWidthChanged: canvas.requestPaint()
        onHeightChanged: canvas.requestPaint()
        Component.onCompleted: canvas.requestPaint()
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
                            text: pairing.paired
                                  ? ("Linked · " + allowedCount() + "/" + permissions.length + " capabilities open")
                                  : "No active control session"
                            color: theme.muted
                            font.pixelSize: 12
                            font.family: theme.fontFamily
                            wrapMode: Text.WordWrap
                            width: parent.width
                        }
                        Rectangle { width: parent.width; height: 1; color: theme.border }
                        Text { text: "Last heartbeat"; color: theme.muted; font.pixelSize: 11; font.family: theme.fontFamily }
                        Row {
                            spacing: 8
                            StatusDot {
                                dotColor: pairing.paired ? theme.success : theme.outline
                                anchors.verticalCenter: parent.verticalCenter
                                width: 7; height: 7
                            }
                            Text {
                                text: heartbeatLabel
                                color: theme.text
                                font.pixelSize: 13
                                font.family: theme.fontFamily
                            }
                        }
                        Text {
                            text: pairing.paired ? "Local agent presence (5s pulse)" : "Pair to start presence"
                            color: theme.outline
                            font.pixelSize: 10
                            font.family: theme.fontFamily
                        }
                    }
                }
                SectionLabel { text: "RECENT ACTIVITY"; Layout.topMargin: 4 }
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 12
                    Repeater {
                        model: activityEvents
                        delegate: RowLayout {
                            required property var modelData
                            Layout.fillWidth: true
                            spacing: 10
                            StatusDot { dotColor: modelData.accent; width: 7; height: 7 }
                            ColumnLayout {
                                Layout.fillWidth: true
                                spacing: 1
                                Text {
                                    text: modelData.title
                                    color: theme.text
                                    font.pixelSize: 12
                                    elide: Text.ElideRight
                                    Layout.fillWidth: true
                                    font.family: theme.fontFamily
                                }
                                Text {
                                    text: formatAge(modelData.at)
                                    color: theme.muted
                                    font.pixelSize: 10
                                    font.family: theme.fontFamily
                                }
                            }
                        }
                    }
                    Text {
                        visible: activityEvents.length === 0
                        text: "No events yet"
                        color: theme.outline
                        font.pixelSize: 12
                        font.family: theme.fontFamily
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
                    onClicked: {
                        var next = []
                        for (var i = 0; i < permissions.length; ++i) {
                            var p = permissions[i]
                            next.push({ id: p.id, title: p.title, detail: p.detail, allowed: false })
                        }
                        permissions = next
                        pushActivity("Sessions stopped", "All capabilities revoked", theme.danger)
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
                            Text {
                                text: pairing.paired ? (allowedCount() > 0 ? "Armed" : "Locked") : "Inactive"
                                color: theme.text
                                font.pixelSize: 15
                                font.bold: true
                                font.family: theme.fontFamily
                            }
                            BodyText {
                                text: allowedCount() + " of " + permissions.length + " capabilities allowed"
                                Layout.fillWidth: true
                                font.pixelSize: 11
                            }
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
                    model: activityEvents
                    delegate: Card {
                        required property var modelData
                        Layout.fillWidth: true
                        Layout.preferredHeight: 78
                        RowLayout {
                            anchors.fill: parent
                            anchors.margins: 16
                            spacing: 14
                            StatusDot { dotColor: modelData.accent; width: 10; height: 10 }
                            ColumnLayout {
                                Layout.fillWidth: true
                                spacing: 2
                                Text { text: modelData.title; color: theme.text; font.pixelSize: 14; font.bold: true; font.family: theme.fontFamily }
                                Text {
                                    text: modelData.detail || ""
                                    color: theme.muted
                                    font.pixelSize: 12
                                    font.family: theme.fontFamily
                                    visible: modelData.detail && modelData.detail.length > 0
                                }
                            }
                            Text { text: formatAge(modelData.at); color: theme.outline; font.pixelSize: 11; font.family: theme.fontFamily }
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
                    text: "Toggle capabilities for this session. Pairing grants all by default; lock any row anytime."
                    Layout.fillWidth: true
                }
                RowLayout {
                    Layout.fillWidth: true
                    spacing: 10
                    Button {
                        text: "Allow all"
                        contentItem: Text {
                            text: parent.text
                            color: theme.primaryForeground
                            font.pixelSize: 12
                            font.bold: true
                            font.family: theme.fontFamily
                            horizontalAlignment: Text.AlignHCenter
                        }
                        background: Rectangle {
                            implicitHeight: 34; implicitWidth: 100; radius: 8
                            color: parent.hovered ? Qt.lighter(theme.primary, 1.08) : theme.primary
                        }
                        onClicked: grantAllPermissions()
                    }
                    Button {
                        text: "Deny all"
                        contentItem: Text {
                            text: parent.text
                            color: theme.danger
                            font.pixelSize: 12
                            font.bold: true
                            font.family: theme.fontFamily
                            horizontalAlignment: Text.AlignHCenter
                        }
                        background: Rectangle {
                            implicitHeight: 34; implicitWidth: 100; radius: 8
                            color: parent.hovered
                                   ? Qt.rgba(theme.danger.r, theme.danger.g, theme.danger.b, 0.16)
                                   : Qt.rgba(theme.danger.r, theme.danger.g, theme.danger.b, 0.10)
                            border.color: Qt.rgba(theme.danger.r, theme.danger.g, theme.danger.b, 0.30)
                        }
                        onClicked: {
                            var next = []
                            for (var i = 0; i < permissions.length; ++i) {
                                var p = permissions[i]
                                next.push({ id: p.id, title: p.title, detail: p.detail, allowed: false })
                            }
                            permissions = next
                            pushActivity("Permissions revoked", "All capabilities denied", theme.danger)
                        }
                    }
                    Item { Layout.fillWidth: true }
                    Text {
                        text: allowedCount() + " allowed"
                        color: theme.muted
                        font.pixelSize: 12
                        font.family: theme.fontFamily
                    }
                }
                Repeater {
                    model: permissions
                    delegate: Card {
                        required property var modelData
                        required property int index
                        Layout.fillWidth: true
                        Layout.preferredHeight: 72
                        RowLayout {
                            anchors.fill: parent
                            anchors.margins: 16
                            spacing: 12
                            ColumnLayout {
                                Layout.fillWidth: true
                                spacing: 2
                                Text { text: modelData.title; color: theme.text; font.pixelSize: 14; font.bold: true; font.family: theme.fontFamily }
                                Text { text: modelData.detail; color: theme.muted; font.pixelSize: 12; font.family: theme.fontFamily }
                            }
                            Pill {
                                label: modelData.allowed ? "ALLOWED" : "DENIED"
                                accent: modelData.allowed ? theme.success : theme.danger
                            }
                            Rectangle {
                                width: 48; height: 28; radius: 14
                                color: modelData.allowed ? theme.primary : theme.border
                                Rectangle {
                                    width: 22; height: 22; radius: 11
                                    color: theme.text
                                    anchors.verticalCenter: parent.verticalCenter
                                    x: modelData.allowed ? parent.width - width - 3 : 3
                                    Behavior on x { NumberAnimation { duration: 120 } }
                                }
                                MouseArea {
                                    anchors.fill: parent
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: setPermission(index, !modelData.allowed)
                                }
                            }
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
