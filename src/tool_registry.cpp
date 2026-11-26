#include "deskdear/tool_registry.hpp"
#include <array>

namespace deskdear {
namespace {
// Keep this table as the single source of truth for the Nally-facing tool surface.
constexpr std::array<ToolSpec, 23> tools{{
    {"status", Capability::Health, "health.status", ToolState::Enabled, false},
    {"read", Capability::WorkspaceRead, "workspace.read", ToolState::Enabled, false},
    {"write", Capability::WorkspaceWrite, "workspace.write", ToolState::Enabled, true},
    {"list", Capability::WorkspaceRead, "workspace.list", ToolState::Planned, false},
    {"info", Capability::WorkspaceRead, "workspace.info", ToolState::Planned, false},
    {"mkdir", Capability::WorkspaceWrite, "workspace.mkdir", ToolState::Planned, true},
    {"mv", Capability::WorkspaceWrite, "workspace.move", ToolState::Planned, true},
    {"delete", Capability::WorkspaceWrite, "workspace.delete", ToolState::Planned, true},
    {"open", Capability::OpenApplication, "application.open", ToolState::Planned, true},
    {"shot", Capability::ScreenCapture, "screen.capture", ToolState::Planned, true},
    {"zoom", Capability::ScreenCapture, "screen.region", ToolState::Planned, true},
    {"cursor", Capability::ScreenCapture, "screen.cursor", ToolState::Planned, true},
    {"move", Capability::InputControl, "input.move", ToolState::Planned, true},
    {"click", Capability::InputControl, "input.click", ToolState::Planned, true},
    {"drag", Capability::InputControl, "input.drag", ToolState::Planned, true},
    {"scroll", Capability::InputControl, "input.scroll", ToolState::Planned, true},
    {"type", Capability::InputControl, "input.type", ToolState::Planned, true},
    {"key", Capability::InputControl, "input.key", ToolState::Planned, true},
    {"hold", Capability::InputControl, "input.hold", ToolState::Planned, true},
    {"wait", Capability::Health, "task.wait", ToolState::Planned, false},
    {"pause", Capability::Health, "task.pause", ToolState::Planned, false},
    {"resume", Capability::Health, "task.resume", ToolState::Planned, true},
    {"cancel", Capability::Health, "task.cancel", ToolState::Planned, false},
}};
}

const ToolSpec* find_tool(const std::string_view public_name) noexcept {
    for (const auto& tool : tools) {
        if (tool.name == public_name) return &tool;
    }
    return nullptr;
}

std::size_t tool_count() noexcept {
    return tools.size();
}

std::size_t enabled_tool_count() noexcept {
    std::size_t count = 0;
    for (const auto& tool : tools) {
        if (tool.state == ToolState::Enabled) ++count;
    }
    return count;
}

} // namespace deskdear
