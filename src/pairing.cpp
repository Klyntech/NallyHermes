#include "deskdear/pairing.hpp"

namespace deskdear {

bool is_valid_pairing_code(const std::string_view code) noexcept {
    if (code.size() != 10) return false;
    for (const char character : code) {
        if (character < '0' || character > '9') return false;
    }
    return true;
}

} // namespace deskdear
