#include "deskdear/simulator.hpp"
#include <chrono>
#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <string_view>
#include <thread>
using namespace std::chrono_literals;
namespace {
std::filesystem::path workspace_root() {
    if (const char* value = std::getenv("DESKDEAR_SIMULATOR_ROOT"); value && *value)
        return value;
    return std::filesystem::temp_directory_path() / "nallydeskdear-simulator";
}
deskdear::SessionPolicy test_session(deskdear::Clock::time_point now) {
    deskdear::SessionPolicy session{true, false, now + 5min, {}};
    session.permissions.grant_for_session(deskdear::Capability::Health);
    session.permissions.grant_for_session(deskdear::Capability::WorkspaceRead);
    session.permissions.grant_for_session(deskdear::Capability::WorkspaceWrite);
    return session;
}
bool self_test() {
    const auto now = deskdear::Clock::now();
    const deskdear::HeadlessSimulator simulator(workspace_root());
    const auto session = test_session(now);
    const deskdear::OperationRequest health{
        "self-test-health", "self-test-session", deskdear::Capability::Health,
        "health.status", now + 30s, false, false, {}, {}};
    const auto health_result = simulator.execute(session, health, now);
    if (!health_result.success) {
        std::cerr << "self-test health failed: " << health_result.message << '\n';
        return false;
    }
    const deskdear::OperationRequest write{
        "self-test-write", "self-test-session", deskdear::Capability::WorkspaceWrite,
        "workspace.write", now + 30s, true, true, {}, {}};
    auto write_request = write;
    write_request.target = "self-test/hello.txt";
    write_request.content = "DeskDear headless simulator works.\n";
    const auto write_result = simulator.execute(session, write_request, now);
    if (!write_result.success) {
        std::cerr << "self-test write failed: " << write_result.message << '\n';
        return false;
    }
    const deskdear::OperationRequest read{
        "self-test-read", "self-test-session", deskdear::Capability::WorkspaceRead,
        "workspace.read", now + 30s, false, false, {}, {}};
    auto read_request = read;
    read_request.target = write_request.target;
    const auto read_result = simulator.execute(session, read_request, now);
    if (!read_result.success || read_result.output != write_request.content) {
        std::cerr << "self-test read failed: " << read_result.message << '\n';
        return false;
    }
    std::cout << "DeskDear headless self-test passed\n"
              << "Workspace root: " << simulator.workspace_root() << '\n';
    return true;
}
void run_worker() {
    std::cout << "DeskDear headless simulator worker started\n"
              << "Workspace root: " << workspace_root() << '\n'
              << "Transport: not connected (simulation mode)\n";
    if (!self_test()) {
        std::cerr << "DeskDear headless simulator startup self-test failed\n";
        std::exit(1);
    }
    while (true) {
        std::cout << "DeskDear simulator heartbeat\n" << std::flush;
        std::this_thread::sleep_for(30s);
    }
}
} // namespace
int main(int argc, char** argv) {
    const std::string_view command = argc > 1 ? argv[1] : "--run";
    if (command == "--self-test") return self_test() ? 0 : 1;
    if (command == "--run") {
        run_worker();
        return 0;
    }
    std::cerr << "Usage: deskdear-simulator [--self-test|--run]\n";
    return 2;
}
