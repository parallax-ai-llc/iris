/**
 * Parallax Iris - ElevenLabs Provider Adapter
 * Supports: text-to-speech, speech-to-text (Scribe)
 */

import { BaseProviderAdapter } from './base-adapter.js';
import {
  AICapability,
  AIRequest,
  AIResponse,
  ProviderName,
  ModelInfo,
} from '../types.js';
import {
  ResponseBuilder,
  OutputBuilder,
  InputValidator,
} from './response-builder.js';
import { mediaInputToBuffer } from './media-utils.js';

export class ElevenLabsAdapter extends BaseProviderAdapter {
  readonly name: ProviderName = 'elevenlabs';
  protected baseUrl = 'https://api.elevenlabs.io/v1';

  readonly capabilities: AICapability[] = ['text-to-speech', 'speech-to-text'];

  readonly models: ModelInfo[] = [
    {
      id: 'eleven_multilingual_v2',
      name: 'Multilingual v2',
      provider: 'elevenlabs',
      capabilities: ['text-to-speech'],
      inputTypes: ['text'],
      outputTypes: ['audio'],
      constraints: {
        maxTokens: 5000,
        supportedFormats: ['mp3', 'wav', 'ogg'],
      },
      pricing: {
        unit: 'token',
        inputCost: 0,
        outputCost: 0.00003,
        currency: 'USD',
      },
      defaultParameters: {
        stability: 0.5,
        similarityBoost: 0.75,
      },
    },
    {
      id: 'eleven_turbo_v2',
      name: 'Turbo v2',
      provider: 'elevenlabs',
      capabilities: ['text-to-speech'],
      inputTypes: ['text'],
      outputTypes: ['audio'],
      constraints: {
        maxTokens: 5000,
        supportedFormats: ['mp3', 'wav', 'ogg'],
      },
      pricing: {
        unit: 'token',
        inputCost: 0,
        outputCost: 0.00002,
        currency: 'USD',
      },
      defaultParameters: {
        stability: 0.5,
        similarityBoost: 0.75,
      },
    },
    {
      id: 'scribe_v1',
      name: 'Scribe v1',
      provider: 'elevenlabs',
      capabilities: ['speech-to-text'],
      inputTypes: ['audio'],
      outputTypes: ['text'],
      constraints: {
        maxAudioDuration: 10800,
        supportedFormats: ['mp3', 'wav', 'mp4', 'mov', 'ogg', 'webm'],
      },
      pricing: {
        unit: 'second',
        inputCost: 0.0001,
        outputCost: 0,
        currency: 'USD',
      },
      defaultParameters: {
        tagAudioEvents: true,
        timestampsGranularity: 'word',
      },
    },
  ];

  protected async validateCredentials(): Promise<void> {
    if (!this.credentials?.apiKey) {
      throw new Error('ElevenLabs API key is required');
    }
    await this.pingApi();
  }

  protected async pingApi(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/user`, {
      headers: { 'xi-api-key': this.credentials!.apiKey! },
    });
    if (!response.ok) {
      throw new Error('Failed to connect to ElevenLabs API');
    }
  }

  async execute(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      this.ensureInitialized();

      switch (request.capability) {
        case 'text-to-speech':
          return this.textToSpeech(request, startTime);
        case 'speech-to-text':
          return this.speechToText(request, startTime);
        default:
          return ResponseBuilder.unsupportedCapability(
            request.capability,
            this.name,
            request.model,
            startTime
          );
      }
    } catch (error) {
      return this.createErrorResponse(error as Error, request, startTime);
    }
  }

  private async textToSpeech(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { prompt, parameters = {} } = request;

    // Validate text input
    if (!prompt || prompt.trim().length === 0) {
      return ResponseBuilder.missingInput(
        'text',
        'text-to-speech',
        this.name,
        request.model,
        startTime
      );
    }

    const model = request.model || 'eleven_multilingual_v2';
    // Support both 'voice' and 'voiceId' parameter names
    const voiceId =
      (parameters.voice as string) ||
      (parameters.voiceId as string) ||
      '21m00Tcm4TlvDq8ikWAM';

    const response = await fetch(`${this.baseUrl}/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': this.credentials!.apiKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: prompt,
        model_id: model,
        voice_settings: {
          stability: parameters.stability || 0.5,
          similarity_boost: parameters.similarityBoost || 0.75,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return ResponseBuilder.apiError(
        this.name,
        response.status,
        errorData.detail?.message || JSON.stringify(errorData),
        request.model,
        startTime
      );
    }

    const audioBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString('base64');

    const modelInfo = this.getModelInfo(model);
    const characterCount = prompt?.length || 0;
    const cost = (modelInfo?.pricing?.outputCost ?? 0.00003) * characterCount;

    return ResponseBuilder.success()
      .outputs([
        OutputBuilder.audio({
          base64: base64Audio,
          mimeType: 'audio/mpeg',
          format: 'mp3',
        }),
      ])
      .usage({ units: characterCount, estimatedCost: cost })
      .metadata(this.name, request.model, startTime)
      .build();
  }

  private async speechToText(
    request: AIRequest,
    startTime: number
  ): Promise<AIResponse> {
    const { parameters = {} } = request;
    const model = request.model || 'scribe_v1';

    // Validate audio input
    const validationError = InputValidator.requireAudio(
      request,
      this.name,
      startTime
    );
    if (validationError) return validationError;

    // Convert audio input to buffer (handles URL, base64, GCS URI, data URI)
    const { buffer, mimeType } = await mediaInputToBuffer(
      request.inputAudio!,
      'audio/mpeg'
    );

    // Determine file extension from mimeType
    const extMap: Record<string, string> = {
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/wav': 'wav',
      'audio/wave': 'wav',
      'audio/x-wav': 'wav',
      'audio/ogg': 'ogg',
      'audio/webm': 'webm',
      'audio/mp4': 'mp4',
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
    };
    const ext = extMap[mimeType] || 'mp3';
    const filename = `audio.${ext}`;

    const formData = new FormData();
    formData.append(
      'file',
      new Blob([buffer as unknown as BlobPart], { type: mimeType }),
      filename
    );
    formData.append('model_id', model);

    // Optional parameters
    if (parameters.languageCode)
      formData.append('language_code', parameters.languageCode as string);
    if (parameters.tagAudioEvents !== undefined)
      formData.append('tag_audio_events', String(parameters.tagAudioEvents));
    if (parameters.numSpeakers)
      formData.append('num_speakers', String(parameters.numSpeakers));
    if (parameters.timestampsGranularity)
      formData.append(
        'timestamps_granularity',
        parameters.timestampsGranularity as string
      );
    if (parameters.diarize !== undefined)
      formData.append('diarize', String(parameters.diarize));

    const response = await fetch(`${this.baseUrl}/speech-to-text`, {
      method: 'POST',
      headers: { 'xi-api-key': this.credentials!.apiKey! },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return ResponseBuilder.apiError(
        this.name,
        response.status,
        errorData.detail?.message || JSON.stringify(errorData),
        request.model,
        startTime
      );
    }

    const result = (await response.json()) as {
      text: string;
      language_code?: string;
      language_probability?: number;
      words?: Array<{
        text: string;
        start: number;
        end: number;
        type: string;
        speaker_id?: string;
      }>;
      transcription_id?: string;
    };

    // Estimate audio duration from words
    let audioDuration = 0;
    if (result.words && result.words.length > 0) {
      audioDuration = result.words[result.words.length - 1].end;
    }

    const modelInfo = this.getModelInfo(model);
    const cost = (modelInfo?.pricing?.inputCost ?? 0.0001) * audioDuration;

    return ResponseBuilder.success()
      .outputs([
        OutputBuilder.text(result.text, {
          languageCode: result.language_code,
          languageProbability: result.language_probability,
          words: result.words,
          transcriptionId: result.transcription_id,
        }),
      ])
      .usage({ units: audioDuration, estimatedCost: cost })
      .metadata(this.name, request.model, startTime)
      .build();
  }
}
