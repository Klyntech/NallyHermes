#include "deskdear/simulator.hpp"
#include <fstream>
#include <iterator>
namespace deskdear {
namespace {
constexpr std::uintmax_t max_file_size = 1024U * 1024U;
ExecutionResult failure(std::string message) {
    return {PolicyError::None, false, std::move(message), {}};
}
bool safe_relative_path(const std::filesystem::path& path) {
    if (path.empty() || path.is_absolute()) return false;
    for (const auto& part : path.lexically_normal()) {
        if (part == "..") return false;
    }
    return true;
}
bool stays_inside_root(const std::filesystem::path& root,
                       const std::filesystem::path& candidate,
                       std::error_code& error) {
    const auto canonical_root = std::filesystem::weakly_canonical(root, error);
    if (error) return false;
    const auto canonical_candidate = std::filesystem::weakly_canonical(candidate, error);
    if (error) return false;
    const auto relative = canonical_candidate.lexically_relative(canonical_root);
    if (relative.empty() || relative.is_absolute()) return false;
    for (const auto& part : relative) {
        if (part == "..") return false;
    }
    return true;
}
} // namespace
HeadlessSimulator::HeadlessSimulator(std::filesystem::path workspace_root)
    : workspace_root_(std::move(workspace_root)) {}
ExecutionResult HeadlessSimulator::execute(const SessionPolicy& session,
                                           const OperationRequest& request,
                                           Clock::time_point now) const {
    const auto decision = PolicyEvaluator::evaluate(session, request, now);
    if (!decision.allowed()) {
        return {decision.error, false, decision.reason, {}};
    }
    if (request.action == "health.status" && request.capability == Capability::Health) {
        return {PolicyError::None, true, "health check passed", "headless simulator healthy"};
    }
    if (request.capability != Capability::WorkspaceRead &&
        request.capability != Capability::WorkspaceWrite) {
        return failure("operation is not implemented by the headless simulator");
    }
    const std::filesystem::path relative = request.target;
    if (!safe_relative_path(relative)) {
        return failure("workspace path must be relative and stay inside the simulator root");
    }
    std::error_code error;
    std::filesystem::create_directories(workspace_root_, error);
    if (error) return failure("cannot create simulator workspace: " + error.message());
    const auto path = workspace_root_ / relative.lexically_normal();
    if (!stays_inside_root(workspace_root_, path, error)) {
        return failure("workspace path resolves outside the simulator root");
    }
    if (request.action == "workspace.write" && request.capability == Capability::WorkspaceWrite) {
        if (request.content.size() > max_file_size) return failure("workspace payload exceeds 1 MiB limit");
        std::filesystem::create_directories(path.parent_path(), error);
        if (error) return failure("cannot create workspace directory: " + error.message());
        std::ofstream output(path, std::ios::binary | std::ios::trunc);
        if (!output) return failure("cannot write workspace file");
        output << request.content;
        if (!output) return failure("failed while writing workspace file");
        return {PolicyError::None, true, "workspace write completed", {}};
    }
    if (request.action == "workspace.read" && request.capability == Capability::WorkspaceRead) {
        if (!std::filesystem::is_regular_file(path, error) || error) {
            return failure("workspace file does not exist");
        }
        const auto size = std::filesystem::file_size(path, error);
        if (error || size > max_file_size) return failure("workspace file exceeds 1 MiB limit");
        std::ifstream input(path, std::ios::binary);
        if (!input) return failure("cannot read workspace file");
        std::string content((std::istreambuf_iterator<char>(input)), std::istreambuf_iterator<char>());
        return {PolicyError::None, true, "workspace read completed", std::move(content)};
    }
    return failure("unsupported simulator operation");
}
} // namespace deskdear
