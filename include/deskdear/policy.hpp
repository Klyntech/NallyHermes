#pragma once
#include "deskdear/operation.hpp"
namespace deskdear {
struct SessionPolicy {
    bool authenticated{false};
    bool revoked{false};
    Clock::time_point expires_at{};
    PermissionSet permissions;
};
class PolicyEvaluator {
public:
    static PolicyDecision evaluate(const SessionPolicy& session,
                                   const OperationRequest& request,
                                   Clock::time_point now = Clock::now()) noexcept;
};
} // namespace deskdear
