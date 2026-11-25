#pragma once

#include <filesystem>
#include <string>

namespace deskdear {

struct DeviceIdentity {
    std::string id;
    std::string display_name;
};

class DeviceIdentityStore {
public:
    // Loads the existing identity or creates a new local identity.
    // The identity is not a credential and must never be used as proof of authorization.
    static DeviceIdentity load_or_create();
    static std::filesystem::path identity_path();
};

} // namespace deskdear
