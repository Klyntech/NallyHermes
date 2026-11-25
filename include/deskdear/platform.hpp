#pragma once

#include <string>

namespace deskdear {

struct PlatformInfo {
    std::string operating_system;
    std::string desktop_environment;
    std::string display_server;
};

PlatformInfo detect_platform();

} // namespace deskdear
