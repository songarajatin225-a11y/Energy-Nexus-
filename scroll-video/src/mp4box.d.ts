declare module 'mp4box' {
  export interface MP4Sample {
    data: ArrayBuffer;
    cts: number;
    dts: number;
    duration: number;
    timescale: number;
    is_sync: boolean;
  }

  export interface MP4VideoTrack {
    id: number;
    codec: string;
    timescale: number;
    duration: number;
    nb_samples: number;
    video: { width: number; height: number };
  }

  export interface MP4Info {
    duration: number;
    timescale: number;
    videoTracks: MP4VideoTrack[];
  }

  export class DataStream {
    constructor(arrayBuffer?: ArrayBuffer, byteOffset?: number, endianness?: boolean);
    static BIG_ENDIAN: boolean;
    static LITTLE_ENDIAN: boolean;
    buffer: ArrayBuffer;
  }

  export interface MP4Box {
    write(stream: DataStream): void;
  }

  export interface MP4Track {
    mdia: { minf: { stbl: { stsd: { entries: Record<string, MP4Box | undefined>[] } } } };
  }

  export interface MP4File {
    onReady: (info: MP4Info) => void;
    onError: (error: string) => void;
    onSamples: (trackId: number, user: unknown, samples: MP4Sample[]) => void;
    appendBuffer(data: ArrayBuffer & { fileStart: number }): number;
    start(): void;
    stop(): void;
    flush(): void;
    setExtractionOptions(trackId: number, user?: unknown, options?: { nbSamples?: number }): void;
    getTrackById(trackId: number): MP4Track;
  }

  export function createFile(): MP4File;
}
