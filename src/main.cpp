#include "deskdear/device_identity.hpp"
#include "deskdear/permissions.hpp"

#include <exception>
#include <iostream>
#include <string_view>

namespace {
constexpr std::string_view version = "0.1.0";

void print_usage() {
    std::cout << "NallyDeskDear " << version << "\n"
              << "Usage: deskdear [--version|--status|--initialize]\n";
}
}

int main(int argc, char** argv) {
    const std::string_view command = argc > 1 ? argv[1] : "--status";

    if (command == "--help" || command == "-h") {
        print_usage();
        return 0;
    }
    if (command == "--version") {
        std::cout << "NallyDeskDear " << version << '\n';
        return 0;
    }
    if (command != "--status" && command != "--initialize") {
        print_usage();
        return 2;
    }

    try {
        const auto identity = deskdear::DeviceIdentityStore::load_or_create();
        const deskdear::PermissionSet permissions;
        std::cout << "NallyDeskDear " << version << '\n'
                  << "Device ID: " << identity.id << '\n'
                  << "Device name: " << identity.display_name << '\n'
                  << "Pairing: not paired\n"
                  << "Control session: inactive\n"
                  << "Permissions: all denied\n"
                  << "Platform adapter: " 
#if defined(_WIN32)
                  << "Windows"
#elif defined(__linux__)
                  << "Linux (desktop portal integration pending)"
#else
                  << "unsupported"
#endif
                  << '\n';
        (void)permissions;
        return 0;
    } catch (const std::exception& error) {
        std::cerr << "DeskDear error: " << error.what() << '\n';
        return 1;
    }
}
