cmake_minimum_required(VERSION 3.20)
project(NallyDeskDear VERSION 0.1.0 LANGUAGES CXX)

option(DESKDEAR_WARNINGS_AS_ERRORS "Treat compiler warnings as errors" OFF)

add_executable(deskdear
    src/main.cpp
    src/device_identity.cpp
    src/permissions.cpp
)
target_include_directories(deskdear PRIVATE include)
target_compile_features(deskdear PRIVATE cxx_std_20)

if(WIN32)
    target_compile_definitions(deskdear PRIVATE NOMINMAX WIN32_LEAN_AND_MEAN)
endif()

if(MSVC)
    target_compile_options(deskdear PRIVATE /W4 /permissive-)
    if(DESKDEAR_WARNINGS_AS_ERRORS)
        target_compile_options(deskdear PRIVATE /WX)
    endif()
else()
    target_compile_options(deskdear PRIVATE -Wall -Wextra -Wpedantic)
    if(DESKDEAR_WARNINGS_AS_ERRORS)
        target_compile_options(deskdear PRIVATE -Werror)
    endif()
endif()

install(TARGETS deskdear RUNTIME DESTINATION bin)
