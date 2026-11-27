#include "deskdear/pairing.hpp"
#include <cassert>

int main() {
    assert(deskdear::is_valid_pairing_code("6749313482"));
    assert(deskdear::is_valid_pairing_code("0000000000"));
    assert(!deskdear::is_valid_pairing_code("123456789"));
    assert(!deskdear::is_valid_pairing_code("12345678901"));
    assert(!deskdear::is_valid_pairing_code("674931348a"));
    assert(!deskdear::is_valid_pairing_code(" 6749313482"));
    assert(!deskdear::is_valid_pairing_code(""));
}
