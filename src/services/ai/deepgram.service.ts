import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { env } from '../../config/env.js';

export class DeepgramService {
    private client;

    constructor() {
        this.client = createClient(env.DEEPGRAM_API_KEY);
    }

    async transcribeAudio(audioBuffer: Buffer): Promise<string> {
        try{
            const { result, error } = await this.client.listen.prerecorded.transcribeFile(
                audioBuffer,
                {
                    model: 'nova-2',
                    language: 'de',
                    smart_format: true,
                    punctuate: true,
                }
            );

            if (error) {
                throw new Error(`Deepgram error: ${error.message}`);
            }

            const transcript = result.results.channels[0].alternatives[0].transcript;
            return transcript;
        } catch (err) {
            throw new Error(`Failed to transcribe audio: ${err}`);
        }
    }

    createLiveTranscription() {
        return this.client.listen.live({
            model: 'nova-2',
            language: 'de',
            smart_format: true,
            punctuate: true,
            interim_results: false,
            endpointing: 300, //ms of silence before finalizing
        });
    }

    setupStreamHandlers(
        connection: any,
        onTranscript: (text: String) => void,
        onError: (error: Error) => void
    ) {
        connection.on(LiveTranscriptionEvents.Open, () => {
            console.log('Deepgram connection opened');
        });

        connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
            const transcript = data.channel.alternatives[0].transcript;
            if(transcript && transcript.trim().length > 0) {
                onTranscript(transcript);
            }
        });

        connection.on(LiveTranscriptionEvents.Error, (error: any) => {
            onError(new Error(`Deepgram error: ${error}`));
        });

        connection.on(LiveTranscriptionEvents.Close, () => {
            console.log('Deepgram connection closed');
        });

        return connection;
    }
}

export const deepgramService = new DeepgramService();