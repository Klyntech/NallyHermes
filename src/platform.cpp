#include "deskdear/platform.hpp"

#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <string>

namespace deskdear {
namespace {

std::string env_value(const char* name) {
    const char* value = std::getenv(name);
    return value ? value : "";
}

std::string lower(std::string value) {
    std::transform(value.begin(), value.end(), value.begin(),
        [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    return value;
}

bool contains(const std::string& value, const std::string& part) {
    return lower(value).find(part) != std::string::npos;
}

} // namespace

PlatformInfo detect_platform() {
#if defined(_WIN32)
    return {"Windows", "Windows desktop", "native"};
#elif defined(__linux__)
    const auto desktop = env_value("XDG_CURRENT_DESKTOP");
    const auto session = lower(env_value("XDG_SESSION_TYPE"));

    std::string environment = "Other Linux desktop";
    if (contains(desktop, "gnome")) environment = "GNOME";
    else if (contains(desktop, "kde") || contains(desktop, "plasma")) environment = "KDE Plasma";

    std::string display = "unknown";
    if (session == "wayland") display = "Wayland";
    else if (session == "x11") display = "X11";

    return {"Linux", environment, display};
#else
    return {"unsupported", "unknown", "unknown"};
#endif
}

} // namespace deskdear
