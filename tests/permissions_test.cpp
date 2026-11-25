#include "deskdear/permissions.hpp"

#include <cassert>

int main() {
    deskdear::PermissionSet permissions;

    assert(!permissions.allows(deskdear::Capability::Health));
    assert(!permissions.allows(deskdear::Capability::ScreenCapture));
    assert(!permissions.allows(deskdear::Capability::InputControl));

    permissions.grant_for_session(deskdear::Capability::Health);
    assert(permissions.allows(deskdear::Capability::Health));
    assert(!permissions.allows(deskdear::Capability::InputControl));

    permissions.grant_for_session(deskdear::Capability::InputControl);
    assert(permissions.allows(deskdear::Capability::InputControl));

    permissions.revoke_all();
    assert(!permissions.allows(deskdear::Capability::Health));
    assert(!permissions.allows(deskdear::Capability::InputControl));
}
