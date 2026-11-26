#include "deskdear/tool_registry.hpp"
#include <cassert>
#include <string_view>

int main() {
    assert(deskdear::tool_count() == 23);
    assert(deskdear::enabled_tool_count() == 3);

    const auto* status = deskdear::find_tool("status");
    assert(status != nullptr);
    assert(status->capability == deskdear::Capability::Health);
    assert(status->action == "health.status");
    assert(status->state == deskdear::ToolState::Enabled);
    assert(!status->approval_required);

    const auto* read = deskdear::find_tool("read");
    assert(read != nullptr);
    assert(read->capability == deskdear::Capability::WorkspaceRead);
    assert(read->action == "workspace.read");
    assert(deskdear::tool_is_enabled("read"));

    const auto* write = deskdear::find_tool("write");
    assert(write != nullptr);
    assert(write->capability == deskdear::Capability::WorkspaceWrite);
    assert(write->action == "workspace.write");
    assert(write->approval_required);

    const auto* shot = deskdear::find_tool("shot");
    assert(shot != nullptr);
    assert(shot->capability == deskdear::Capability::ScreenCapture);
    assert(shot->action == "screen.capture");
    assert(!deskdear::tool_is_enabled("shot"));

    const auto* file_move = deskdear::find_tool("mv");
    const auto* pointer_move = deskdear::find_tool("move");
    assert(file_move != nullptr && pointer_move != nullptr);
    assert(file_move->action == "workspace.move");
    assert(pointer_move->action == "input.move");

    assert(deskdear::find_tool("workspace.read") == nullptr);
    assert(deskdear::find_tool("computer") == nullptr);
    assert(deskdear::find_tool(std::string_view{}) == nullptr);
}
