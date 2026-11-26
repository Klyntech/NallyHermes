#include "deskdear/simulator.hpp"
#include <cassert>
#include <filesystem>
#include <fstream>
#include <string>
using namespace std::chrono_literals;
namespace {
struct Fixture {
    std::filesystem::path root = std::filesystem::temp_directory_path() / "nallydeskdear-security-test";
    deskdear::Clock::time_point now = deskdear::Clock::time_point{} + 100s;
    deskdear::HeadlessSimulator simulator;
    deskdear::SessionPolicy session;
    Fixture() : simulator(root), session{true, false, now + 60s, {}} {
        std::filesystem::remove_all(root);
        std::filesystem::create_directories(root);
        session.permissions.grant_for_session(deskdear::Capability::Health);
        session.permissions.grant_for_session(deskdear::Capability::WorkspaceRead);
        session.permissions.grant_for_session(deskdear::Capability::WorkspaceWrite);
    }
    ~Fixture() { std::filesystem::remove_all(root); }
};
deskdear::OperationRequest request(std::string id, deskdear::Capability capability,
                                   std::string action, const Fixture& fixture) {
    return {std::move(id), "session-1", capability, std::move(action),
            fixture.now + 10s, false, false, {}, {}};
}
void test_normal_operations(Fixture& fixture) {
    auto health = request("health", deskdear::Capability::Health, "health.status", fixture);
    assert(fixture.simulator.execute(fixture.session, health, fixture.now).success);
    auto write = request("write", deskdear::Capability::WorkspaceWrite, "workspace.write", fixture);
    write.target = "notes/today.txt";
    write.content = "Berlin request; Nigeria execution.\n";
    assert(fixture.simulator.execute(fixture.session, write, fixture.now).success);
    auto read = request("read", deskdear::Capability::WorkspaceRead, "workspace.read", fixture);
    read.target = write.target;
    const auto result = fixture.simulator.execute(fixture.session, read, fixture.now);
    assert(result.success);
    assert(result.output == write.content);
}
void test_authorization_failures(Fixture& fixture) {
    auto write = request("approval", deskdear::Capability::WorkspaceWrite, "workspace.write", fixture);
    write.target = "approval.txt";
    write.content = "must not write";
    write.requires_local_approval = true;
    auto result = fixture.simulator.execute(fixture.session, write, fixture.now);
    assert(!result.success && result.policy_error == deskdear::PolicyError::LocalApprovalRequired);
    fixture.session.authenticated = false;
    result = fixture.simulator.execute(fixture.session, write, fixture.now);
    assert(!result.success && result.policy_error == deskdear::PolicyError::Unauthenticated);
    fixture.session.authenticated = true;
    fixture.session.revoked = true;
    result = fixture.simulator.execute(fixture.session, write, fixture.now);
    assert(!result.success && result.policy_error == deskdear::PolicyError::SessionRevoked);
    fixture.session.revoked = false;
    fixture.session.expires_at = fixture.now;
    result = fixture.simulator.execute(fixture.session, write, fixture.now);
    assert(!result.success && result.policy_error == deskdear::PolicyError::SessionExpired);
    fixture.session.expires_at = fixture.now + 60s;
    write.deadline = fixture.now;
    result = fixture.simulator.execute(fixture.session, write, fixture.now);
    assert(!result.success && result.policy_error == deskdear::PolicyError::DeadlineExceeded);
}
void test_path_and_resource_boundaries(Fixture& fixture) {
    auto write = request("traversal", deskdear::Capability::WorkspaceWrite, "workspace.write", fixture);
    write.target = "../outside.txt";
    write.content = "escape";
    auto result = fixture.simulator.execute(fixture.session, write, fixture.now);
    assert(!result.success);
    assert(!std::filesystem::exists(fixture.root.parent_path() / "outside.txt"));
    write.target = std::filesystem::absolute("/tmp/outside-deskdear.txt").string();
    result = fixture.simulator.execute(fixture.session, write, fixture.now);
    assert(!result.success);
    write.target = "too-large.bin";
    write.content.assign(1024U * 1024U + 1U, 'x');
    result = fixture.simulator.execute(fixture.session, write, fixture.now);
    assert(!result.success);
    auto malformed = request("unknown", deskdear::Capability::WorkspaceWrite, "unknown.action", fixture);
    result = fixture.simulator.execute(fixture.session, malformed, fixture.now);
    assert(!result.success);
}
void test_symlink_escape(Fixture& fixture) {
    std::error_code error;
    const auto outside = fixture.root.parent_path() / "nallydeskdear-security-outside";
    std::filesystem::remove_all(outside);
    std::filesystem::create_directories(outside);
    std::ofstream(outside / "secret.txt") << "secret outside workspace";
    std::filesystem::create_directory_symlink(outside, fixture.root / "linked", error);
    if (error) return;
    auto read = request("symlink-read", deskdear::Capability::WorkspaceRead, "workspace.read", fixture);
    read.target = "linked/secret.txt";
    auto result = fixture.simulator.execute(fixture.session, read, fixture.now);
    assert(!result.success);
    auto write = request("symlink-write", deskdear::Capability::WorkspaceWrite, "workspace.write", fixture);
    write.target = "linked/changed.txt";
    write.content = "must not escape";
    result = fixture.simulator.execute(fixture.session, write, fixture.now);
    assert(!result.success);
    assert(!std::filesystem::exists(outside / "changed.txt"));
    std::filesystem::remove_all(outside);
}
}
int main() {
    Fixture fixture;
    test_normal_operations(fixture);
    test_authorization_failures(fixture);
    test_path_and_resource_boundaries(fixture);
    test_symlink_escape(fixture);
}
