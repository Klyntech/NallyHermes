#include "deskdear/device_identity.hpp"

#include <array>
#include <cstdlib>
#include <fstream>
#include <random>
#include <stdexcept>

namespace deskdear {
namespace {

std::string make_id() {
    std::array<unsigned char, 16> bytes{};
    std::random_device source;
    for (auto& byte : bytes) {
        byte = static_cast<unsigned char>(source() & 0xffU);
    }

    // RFC 4122 version 4 / variant bits. This is an identifier, not a secret.
    bytes[6] = static_cast<unsigned char>((bytes[6] & 0x0fU) | 0x40U);
    bytes[8] = static_cast<unsigned char>((bytes[8] & 0x3fU) | 0x80U);

    constexpr char hex[] = "0123456789abcdef";
    std::string result;
    result.reserve(36);
    for (std::size_t i = 0; i < bytes.size(); ++i) {
        if (i == 4 || i == 6 || i == 8 || i == 10) result.push_back('-');
        result.push_back(hex[(bytes[i] >> 4U) & 0x0fU]);
        result.push_back(hex[bytes[i] & 0x0fU]);
    }
    return result;
}

std::string device_name() {
#if defined(_WIN32)
    if (const char* value = std::getenv("COMPUTERNAME")) return value;
#else
    if (const char* value = std::getenv("HOSTNAME")) return value;
#endif
    return "NallyDeskDear device";
}

} // namespace

std::filesystem::path DeviceIdentityStore::identity_path() {
#if defined(_WIN32)
    const char* root = std::getenv("APPDATA");
    if (root && *root) return std::filesystem::path(root) / "NallyDeskDear" / "device-id";
    return std::filesystem::temp_directory_path() / "NallyDeskDear" / "device-id";
#else
    if (const char* xdg = std::getenv("XDG_CONFIG_HOME"); xdg && *xdg)
        return std::filesystem::path(xdg) / "nallydeskdear" / "device-id";
    if (const char* home = std::getenv("HOME"); home && *home)
        return std::filesystem::path(home) / ".config" / "nallydeskdear" / "device-id";
    return std::filesystem::temp_directory_path() / "nallydeskdear" / "device-id";
#endif
}

DeviceIdentity DeviceIdentityStore::load_or_create() {
    const auto path = identity_path();
    std::error_code error;
    std::filesystem::create_directories(path.parent_path(), error);
    if (error) throw std::runtime_error("Cannot create DeskDear configuration directory: " + error.message());

    if (std::filesystem::exists(path)) {
        std::ifstream input(path);
        std::string id;
        std::getline(input, id);
        if (!input && id.empty()) throw std::runtime_error("Cannot read DeskDear device identity");
        if (id.size() != 36) throw std::runtime_error("DeskDear device identity file is invalid");
        return {id, device_name()};
    }

    const auto id = make_id();
    {
        std::ofstream output(path, std::ios::out | std::ios::trunc);
        if (!output) throw std::runtime_error("Cannot write DeskDear device identity");
        output << id << '\n';
        output.flush();
        if (!output) throw std::runtime_error("Failed to persist DeskDear device identity");
    }
#if !defined(_WIN32)
    std::filesystem::permissions(path, std::filesystem::perms::owner_read |
        std::filesystem::perms::owner_write, std::filesystem::perm_options::replace, error);
#endif
    return {id, device_name()};
}

} // namespace deskdear
