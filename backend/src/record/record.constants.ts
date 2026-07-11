export const RECORD_VOICE_FILE_FIELD_NAME = 'voiceFile';
// 다운샘플로 OpenAI의 25MB STT 제한을 우회하므로 입력 상한을 넉넉히 둔다.
// 단일 ECS 태스크 메모리를 보호하기 위해 무제한이 아닌 유한값으로 제한한다.
export const RECORD_VOICE_FILE_SIZE_LIMIT_BYTES = 100 * 1024 * 1024;
export const RECORD_MEMO_MAX_LENGTH = 1000;

export const OPENAI_API_KEY_ENV = 'OPENAI_API_KEY';
export const OPENAI_TRANSCRIPTION_MODEL_ENV = 'OPENAI_TRANSCRIPTION_MODEL';
export const DEFAULT_OPENAI_TRANSCRIPTION_MODEL = 'gpt-4o-transcribe';
export const OPENAI_AUDIO_TRANSCRIPTIONS_URL =
  'https://api.openai.com/v1/audio/transcriptions';
export const OPENAI_SUMMARY_MODEL_ENV = 'OPENAI_SUMMARY_MODEL';
export const DEFAULT_OPENAI_SUMMARY_MODEL = 'gpt-5.5';
export const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

// OpenAI 호출이 무한정 매달리지 않도록 AbortController로 상한을 건다.
// 전사는 긴 오디오까지 감안해 넉넉히, 요약은 짧은 텍스트라 더 짧게 둔다.
export const OPENAI_TRANSCRIPTION_TIMEOUT_MS = 10 * 60 * 1000;
export const OPENAI_SUMMARY_TIMEOUT_MS = 2 * 60 * 1000;

// ffmpeg 다운샘플 설정: 음성 인식은 16kHz mono면 충분하고, 이 정도로 줄이면
// 긴 녹음도 25MB 미만이 되어 분할 없이 한 번의 STT 호출로 처리된다.
export const AUDIO_DOWNSAMPLE_SAMPLE_RATE = 16000;
export const AUDIO_DOWNSAMPLE_CHANNELS = 1;
