#pragma once
#include "deskdear/operation.hpp"
#include "deskdear/policy.hpp"
#include <filesystem>
#include <string>
namespace deskdear {
struct ExecutionResult {
    PolicyError policy_error{PolicyError::None};
    bool success{false};
    std::string message;
    std::string output;
};
class HeadlessSimulator {
public:
    explicit HeadlessSimulator(std::filesystem::path workspace_root);
    ExecutionResult execute(const SessionPolicy& session,
                            const OperationRequest& request,
                            Clock::time_point now = Clock::now()) const;
    const std::filesystem::path& workspace_root() const noexcept { return workspace_root_; }
private:
    std::filesystem::path workspace_root_;
};
} // namespace deskdear
