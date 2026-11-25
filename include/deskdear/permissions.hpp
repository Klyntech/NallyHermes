#pragma once

#include <string_view>

namespace deskdear {

enum class Capability {
    Health,
    WorkspaceRead,
    WorkspaceWrite,
    OpenApplication,
    RunCommand,
    ScreenCapture,
    InputControl
};

std::string_view capability_name(Capability capability) noexcept;

class PermissionSet {
public:
    // All capabilities are denied until explicitly granted by a future
    // authenticated, user-approved session.
    bool allows(Capability capability) const noexcept;
    void grant_for_session(Capability capability) noexcept;
    void revoke_all() noexcept;

private:
    unsigned int granted_{0};
};

} // namespace deskdear
