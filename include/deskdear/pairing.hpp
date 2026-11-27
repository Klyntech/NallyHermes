#pragma once

#include <string_view>

namespace deskdear {

// v4 pairing contract: Telegram issues a random 10-digit code valid for five minutes.
// DeskDear validates format locally but never stores or logs the raw code.
bool is_valid_pairing_code(std::string_view code) noexcept;

} // namespace deskdear
