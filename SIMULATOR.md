# Headless DeskDear simulator

The headless simulator is a Linux-friendly test agent for validating DeskDear policy and workspace behavior before a real Windows or graphical Linux desktop is available. It deliberately does not claim to control a real screen, keyboard, mouse, or application session.

## Local build

The simulator is built by CMake as `deskdear-simulator`:

```sh
cmake -S . -B build -DBUILD_TESTING=ON
cmake --build build --config Release
ctest --test-dir build --output-on-failure
```

Run the deterministic self-test with:

```sh
DESKDEAR_SIMULATOR_ROOT=/tmp/deskdear-simulator ./build/deskdear-simulator --self-test
```

The self-test exercises health reporting, an approval-gated workspace write, a workspace read, the one-megabyte file limit, and the sandbox workspace root. The simulator rejects absolute paths and traversal through `..`.

The adversarial security suite is registered with CTest and can be run directly after building:

```sh
ctest --test-dir build -R deskdear_simulator_security --output-on-failure
```

It covers authentication, expiry, revocation, approval, malformed actions, traversal, absolute paths, oversized payloads, and symlink escape attempts. Workspace paths are checked after canonical resolution so a symlink inside the simulator root cannot redirect an operation outside it.

Run the worker loop with:

```sh
DESKDEAR_SIMULATOR_ROOT=/tmp/deskdear-simulator ./build/deskdear-simulator --run
```

The current worker is intentionally transport-free. It runs a startup self-test and emits heartbeats so Render can host it while the authenticated control-plane transport is implemented separately.

## Render deployment

`render.yaml` declares the simulator as a Render **background worker** built from `Dockerfile`. This is the correct Render service type for the current design because the simulator does not accept inbound traffic; it will eventually initiate an outbound authenticated connection to NallyHermes.

The Blueprint currently leaves `DESKDEAR_CONTROL_PLANE_URL` unsynchronized so it can be supplied as a secret or environment-specific value in the Render dashboard. No credential is committed to this repository. `autoDeployTrigger: off` prevents an accidental deployment on every branch update while the simulator is still transport-free.

From the repository root, the Docker image can also be tested locally:

```sh
docker build -t nallydeskdear-simulator .
docker run --rm nallydeskdear-simulator --self-test
```

The Render worker filesystem is not the user's Nigerian computer. Data written by the simulator is test data only and should be treated as ephemeral until a persistent disk or external test fixture is deliberately configured.
