cmake_minimum_required(VERSION 3.20)
project(NallyDeskDear VERSION 0.1.0 LANGUAGES CXX)

option(DESKDEAR_WARNINGS_AS_ERRORS "Treat compiler warnings as errors" OFF)
option(DESKDEAR_BUILD_UI "Build the shared Qt Quick desktop UI" OFF)

add_executable(deskdear
    src/main.cpp
    src/device_identity.cpp
    src/permissions.cpp
    src/platform.cpp
    src/policy.cpp
    src/pairing.cpp
    src/simulator.cpp
    src/tool_registry.cpp
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

include(CTest)
if(BUILD_TESTING)
    add_executable(deskdear_permissions_test
        tests/permissions_test.cpp
        src/permissions.cpp
    )
    target_include_directories(deskdear_permissions_test PRIVATE include)
    target_compile_features(deskdear_permissions_test PRIVATE cxx_std_20)
    add_test(NAME deskdear_permissions COMMAND deskdear_permissions_test)

    add_executable(deskdear_policy_test
        tests/policy_test.cpp
        src/permissions.cpp
        src/policy.cpp
    )
    target_include_directories(deskdear_policy_test PRIVATE include)
    target_compile_features(deskdear_policy_test PRIVATE cxx_std_20)
    add_test(NAME deskdear_policy COMMAND deskdear_policy_test)

    add_executable(deskdear_simulator_security_test
        tests/simulator_security_test.cpp
        src/simulator.cpp
        src/permissions.cpp
        src/policy.cpp
    )
    target_include_directories(deskdear_simulator_security_test PRIVATE include)
    target_compile_features(deskdear_simulator_security_test PRIVATE cxx_std_20)
    add_test(NAME deskdear_simulator_security COMMAND deskdear_simulator_security_test)

    add_executable(deskdear_tool_registry_test
        tests/tool_registry_test.cpp
        src/tool_registry.cpp
    )
    target_include_directories(deskdear_tool_registry_test PRIVATE include)
    target_compile_features(deskdear_tool_registry_test PRIVATE cxx_std_20)
    add_test(NAME deskdear_tool_registry COMMAND deskdear_tool_registry_test)

    add_executable(deskdear_pairing_test
        tests/pairing_test.cpp
        src/pairing.cpp
    )
    target_include_directories(deskdear_pairing_test PRIVATE include)
    target_compile_features(deskdear_pairing_test PRIVATE cxx_std_20)
    add_test(NAME deskdear_pairing COMMAND deskdear_pairing_test)
endif()

add_executable(deskdear-simulator
    src/simulator_main.cpp
    src/simulator.cpp
    src/permissions.cpp
    src/policy.cpp
)
target_include_directories(deskdear-simulator PRIVATE include)
target_compile_features(deskdear-simulator PRIVATE cxx_std_20)
if(MSVC)
    target_compile_options(deskdear-simulator PRIVATE /W4 /permissive-)
else()
    target_compile_options(deskdear-simulator PRIVATE -Wall -Wextra -Wpedantic)
endif()

if(DESKDEAR_BUILD_UI)
    find_package(Qt6 6.8 REQUIRED COMPONENTS Network Quick QuickControls2)
    qt_add_executable(deskdear-ui
        src/ui_main.cpp
        src/device_identity.cpp
        src/ui_pairing_controller.cpp
    )
    qt_add_resources(deskdear-ui deskdear_ui_resources
        PREFIX "/deskdear"
        FILES ui/qml/Main.qml
    )
    target_include_directories(deskdear-ui PRIVATE src include)
    target_link_libraries(deskdear-ui PRIVATE Qt6::Network Qt6::Quick Qt6::QuickControls2)
    target_compile_features(deskdear-ui PRIVATE cxx_std_20)
    set_target_properties(deskdear-ui PROPERTIES WIN32_EXECUTABLE TRUE)
    install(TARGETS deskdear-ui RUNTIME DESTINATION bin)
    install(FILES packaging/linux/deskdear.desktop DESTINATION share/applications)
    install(FILES packaging/linux/deskdear.svg DESTINATION share/icons/hicolor/scalable/apps)
endif()

# ---------------------------------------------------------------------------
# Packaging (CPack)
# ---------------------------------------------------------------------------
include(InstallRequiredSystemLibraries)
include(CPack)

set(CPACK_PACKAGE_NAME "DeskDear")
set(CPACK_PACKAGE_VENDOR "NallyHermes")
set(CPACK_PACKAGE_VERSION ${PROJECT_VERSION})
set(CPACK_PACKAGE_DESCRIPTION_SUMMARY "Secure desktop agent for Nally")
set(CPACK_PACKAGE_HOMEPAGE_URL "https://github.com/Klyntech/NallyHermes")
set(CPACK_PACKAGE_CONTACT "Klyntech")
set(CPACK_RESOURCE_FILE_LICENSE "${CMAKE_SOURCE_DIR}/LICENSE")
if(NOT EXISTS "${CMAKE_SOURCE_DIR}/LICENSE")
    # LICENSE may not exist yet; NSIS still builds without it.
    unset(CPACK_RESOURCE_FILE_LICENSE)
endif()
set(CPACK_PACKAGE_FILE_NAME "DeskDear-${PROJECT_VERSION}-${CMAKE_SYSTEM_NAME}-${CMAKE_SYSTEM_PROCESSOR}")
set(CPACK_PACKAGE_INSTALL_DIRECTORY "DeskDear")
set(CPACK_PACKAGE_EXECUTABLES "deskdear-ui;DeskDear")
set(CPACK_CREATE_DESKTOP_LINKS "deskdear-ui")

if(WIN32)
    # NSIS produces a single installable Setup.exe.
    # ZIP remains available as a portable fallback.
    set(CPACK_GENERATOR "NSIS;ZIP")
    set(CPACK_NSIS_DISPLAY_NAME "DeskDear")
    set(CPACK_NSIS_PACKAGE_NAME "DeskDear")
    set(CPACK_NSIS_ENABLE_UNINSTALL_BEFORE_INSTALL ON)
    set(CPACK_NSIS_MODIFY_PATH OFF)
    set(CPACK_NSIS_MUI_ICON "")
    set(CPACK_NSIS_INSTALLED_ICON_NAME "bin\\deskdear-ui.exe")
    set(CPACK_NSIS_MENU_LINKS
        "bin/deskdear-ui.exe" "DeskDear"
    )
    set(CPACK_NSIS_EXECUTABLES_DIRECTORY "bin")
    set(CPACK_NSIS_HELP_LINK "https://github.com/Klyntech/NallyHermes")
    set(CPACK_NSIS_URL_INFO_ABOUT "https://github.com/Klyntech/NallyHermes")
    # Install for current user by default (no admin required for portable use).
    set(CPACK_NSIS_DEFINES "RequestExecutionLevel user")
elseif(UNIX AND NOT APPLE)
    set(CPACK_GENERATOR "TGZ;DEB")
endif()
