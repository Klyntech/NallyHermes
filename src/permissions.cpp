#include "deskdear/permissions.hpp"

namespace deskdear {
namespace {
constexpr unsigned int bit(Capability capability) noexcept {
    return 1U << static_cast<unsigned int>(capability);
}
}

std::string_view capability_name(Capability capability) noexcept {
    switch (capability) {
        case Capability::Health: return "health";
        case Capability::WorkspaceRead: return "workspace.read";
        case Capability::WorkspaceWrite: return "workspace.write";
        case Capability::OpenApplication: return "application.open";
        case Capability::RunCommand: return "command.run";
        case Capability::ScreenCapture: return "screen.capture";
        case Capability::InputControl: return "input.control";
    }
    return "unknown";
}

bool PermissionSet::allows(Capability capability) const noexcept {
    return (granted_ & bit(capability)) != 0U;
}

void PermissionSet::grant_for_session(Capability capability) noexcept {
    granted_ |= bit(capability);
}

void PermissionSet::revoke_all() noexcept {
    granted_ = 0U;
}

} // namespace deskdear
