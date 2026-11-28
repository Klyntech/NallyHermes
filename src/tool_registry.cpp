#include "deskdear/tool_registry.hpp"
#include <array>

namespace deskdear {
namespace {
// Keep this table as the single source of truth for the Nally-facing tool surface.
constexpr std::array<ToolSpec, 23> tools{{
    {"status", Capability::Health, "health.status", ToolState::Enabled, false},
    {"read", Capability::WorkspaceRead, "workspace.read", ToolState::Enabled, false},
    {"write", Capability::WorkspaceWrite, "workspace.write", ToolState::Enabled, true},
    {"list", Capability::WorkspaceRead, "workspace.list", ToolState::Enabled, false},
    {"info", Capability::WorkspaceRead, "workspace.info", ToolState::Enabled, false},
    {"mkdir", Capability::WorkspaceWrite, "workspace.mkdir", ToolState::Enabled, true},
    {"mv", Capability::WorkspaceWrite, "workspace.move", ToolState::Enabled, true},
    {"delete", Capability::WorkspaceWrite, "workspace.delete", ToolState::Enabled, true},
    {"open", Capability::OpenApplication, "application.open", ToolState::Enabled, true},
    {"shot", Capability::ScreenCapture, "screen.capture", ToolState::Enabled, true},
    {"zoom", Capability::ScreenCapture, "screen.region", ToolState::Enabled, true},
    {"cursor", Capability::ScreenCapture, "screen.cursor", ToolState::Enabled, true},
    {"move", Capability::InputControl, "input.move", ToolState::Enabled, true},
    {"click", Capability::InputControl, "input.click", ToolState::Enabled, true},
    {"drag", Capability::InputControl, "input.drag", ToolState::Enabled, true},
    {"scroll", Capability::InputControl, "input.scroll", ToolState::Enabled, true},
    {"type", Capability::InputControl, "input.type", ToolState::Enabled, true},
    {"key", Capability::InputControl, "input.key", ToolState::Enabled, true},
    {"hold", Capability::InputControl, "input.hold", ToolState::Enabled, true},
    {"wait", Capability::Health, "task.wait", ToolState::Enabled, false},
    {"pause", Capability::Health, "task.pause", ToolState::Enabled, false},
    {"resume", Capability::Health, "task.resume", ToolState::Enabled, true},
    {"cancel", Capability::Health, "task.cancel", ToolState::Enabled, false},
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
