#pragma once

#include "deskdear/permissions.hpp"
#include <cstddef>
#include <optional>
#include <string_view>

namespace deskdear {

enum class ToolState {
    Planned,
    Enabled
};

struct ToolSpec {
    std::string_view name;
    Capability capability;
    std::string_view action;
    ToolState state;
    bool approval_required;
};

// Public names exposed to Nally. Policy code uses capability/action internally.
const ToolSpec* find_tool(std::string_view public_name) noexcept;
std::size_t tool_count() noexcept;
std::size_t enabled_tool_count() noexcept;

inline bool tool_is_enabled(std::string_view public_name) noexcept {
    const auto* tool = find_tool(public_name);
    return tool != nullptr && tool->state == ToolState::Enabled;
}

} // namespace deskdear
