# Hey Nally wake-word model — training and integration plan

## Current status

No Hey Nally model has been trained or validated. The Android app currently uses the bundled openWakeWord **Hey Jarvis** classifier. The listener can only detect the phrase shown in Settings and its persistent notification. A user saying “Hey Nally” will not reliably trigger that model.

The Android service is prepared to load `android/app/src/main/assets/hey_nally.onnx` when that exact asset is added. It uses the bundled Hey Jarvis model only while the custom asset is absent. The model choice is visible in the service log and the app’s wake-word label. Do not add a model file to that path until the artifact has passed the checks below.

## Supported training route

Use the upstream [openWakeWord automated model training notebook](https://github.com/dscripka/openWakeWord/blob/main/notebooks/automatic_model_training.ipynb) for a first model. Use the [detailed training notebook](https://github.com/dscripka/openWakeWord/blob/main/notebooks/training_models.ipynb) if the basic model’s detection quality is insufficient and the training setup can be reproduced. The upstream project’s documented recipe uses generated positive examples for the desired phrase and a broad negative corpus. It recommends at least several thousand positive examples; its published included models used roughly 30,000 hours of negative speech, noise, and music. Those numbers describe the upstream project’s training practice, not a guarantee that a small model will meet production false-accept targets.

For “Hey Nally,” generate varied English pronunciations and speaking styles, then hold out speakers and recordings that are not used for training. Include clean, far-field, quiet, fast, slow, whispered, accented, reverberant and noisy examples in evaluation. Obtain separate negative audio containing ordinary speech with near-phrases (for example, “Hey Natalie”), television, music, room noise and silence. Do not place personal recordings, credentials, or user audio in the public Git repository. Record data provenance and consent outside the model artifact.

## Validation gate before Android packaging

1. Confirm the training output is a classifier-only ONNX model supported by the Android port. Its README specifies model input shape `[1, 16, 96]` and output shape `[1, 1]`; the Android code supplies the shared mel and speech-embedding stages.
2. Validate the ONNX model loads on-device and measure real-time CPU and memory impact on low-, mid- and high-tier Android devices.
3. Sweep thresholds on a held-out set. Report false rejects on positive clips and false accepts per hour on negative audio. Include confusion counts and test duration. Do not select a threshold solely from training accuracy or assume the current `0.5` threshold is optimal for a newly trained classifier.
4. Run prolonged device listening with representative background speech/noise and test permission revocation, service restart, call pause/resume, notification handoff, battery restrictions and OEM behavior.
5. Only after those checks, copy the selected version to `android/app/src/main/assets/hey_nally.onnx`, record its SHA-256, data/training provenance, threshold and evaluation results here, and update the app release notes.

## Integration details

The declared dependency is [`msnilsen/openwakeword-android`](https://github.com/msnilsen/openwakeword-android). Its documented custom path is `OpenWakeWord.Builder(context).setModelAsset("hey_nally.onnx")`. The repository’s `WakeWordService` already checks for that root-level app asset and selects it when present. If it is absent, the service explicitly reports and uses Hey Jarvis. No separate custom preprocessing or embedding assets are required by this library’s documented API.

## Reproducibility record

Fill this section only after training and validation:

- Upstream trainer commit / notebook revision:
- Positive-data source, count, speaker split and consent:
- Negative-data source, hours and composition:
- Training seed and settings:
- ONNX SHA-256:
- Held-out positive clips / false rejects:
- Held-out negative hours / false accepts per hour:
- Threshold and device/runtime measurements:
- Reviewer and date:

## Sources

- [openWakeWord project and training guidance](https://github.com/dscripka/openWakeWord)
- [Automated model training notebook](https://github.com/dscripka/openWakeWord/blob/main/notebooks/automatic_model_training.ipynb)
- [Detailed training notebook](https://github.com/dscripka/openWakeWord/blob/main/notebooks/training_models.ipynb)
- [Android port and custom-model API](https://github.com/msnilsen/openwakeword-android)
