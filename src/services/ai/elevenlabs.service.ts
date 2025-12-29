import { env } from '../../config/env.js';

export class ElevenLabsService {
  private apiKey: string;
  private voiceId: string;

  constructor() {
    this.apiKey = env.ELEVENLABS_API_KEY;
    this.voiceId = env.ELEVENLABS_VOICE_ID;
  }

  /**
   * Convert text to speech and return audio buffer
   */
  async textToSpeech(text: string): Promise<Buffer> {
    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`,
        {
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': this.apiKey,
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_flash_v2_5',
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
              style: 0.0,
              use_speaker_boost: true,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (err) {
      throw new Error(`Failed to generate speech: ${err}`);
    }
  }

  /**
   * Stream text to speech (for real-time applications)
   */
  async textToSpeechStream(text: string): Promise<ReadableStream<Uint8Array>> {
    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream`,
        {
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': this.apiKey,
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_flash_v2_5',
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      return response.body;
    } catch (err) {
      throw new Error(`Failed to stream speech: ${err}`);
    }
  }

  /**
   * Get available voices
   */
  async getVoices() {
    try {
      const response = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      throw new Error(`Failed to fetch voices: ${err}`);
    }
  }
}

export const elevenLabsService = new ElevenLabsService();