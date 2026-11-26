FROM debian:bookworm-slim AS build
RUN apt-get update \
    && apt-get install -y --no-install-recommends cmake g++ make \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY . .
RUN cmake -S . -B build -DBUILD_TESTING=ON -DDESKDEAR_WARNINGS_AS_ERRORS=ON \
    && cmake --build build --config Release \
    && ctest --test-dir build --output-on-failure

FROM debian:bookworm-slim
RUN useradd --create-home --uid 10001 deskdear
COPY --from=build /src/build/deskdear-simulator /usr/local/bin/deskdear-simulator
ENV DESKDEAR_SIMULATOR_ROOT=/tmp/nallydeskdear-simulator
USER deskdear
ENTRYPOINT ["/usr/local/bin/deskdear-simulator"]
CMD ["--run"]
