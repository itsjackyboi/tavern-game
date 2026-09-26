// Chiptune loops written as data. Each song is a set of 16th-note steps.
// Notes: "C4", "D#5", "." = rest, "-" = hold. Drums: k kick, s snare, h hat, . rest.
// Moods (docs/PLAN.md §2.11):
//  Aleforge: warm, brassy, festive oom-pah.     Shanty Town: rowdy 6/8 sea-shanty, dorian.
//  Providence: restrained bell chimes by day, a looser night waltz.
//  Roto Kaiishi: busy market plucks, phrygian-dominant.  World map: calm, strategic pads.

export interface Song {
  id: string;
  bpm: number;
  /** Steps per beat (4 = 16ths, 3 = triplet 8ths for 6/8 and 3/4 feels). */
  stepsPerBeat: number;
  lead: string;
  leadWave: 'square' | 'pulse25' | 'pulse12' | 'triangle' | 'bell';
  bass: string;
  bassWave: 'triangle' | 'square' | 'pulse25';
  drums: string;
  harmony?: string;
  harmonyWave?: 'triangle' | 'bell' | 'pulse25';
  gain: number;
}

const s = (x: string) => x.trim().split(/\s+/).join(' ');

export const SONGS: Record<string, Song> = {
  aleforge: {
    id: 'aleforge', bpm: 128, stepsPerBeat: 4, leadWave: 'square', bassWave: 'triangle', gain: 0.9,
    lead: s(`G4 . C5 . E5 . G5 - E5 . C5 . D5 . E5 . F5 . A5 . F5 . D5 . E5 . C5 . G4 . C5 . E5 . G5 . A5 . G5 . E5 . C5 . D5 . G4 . C5 - - -
             E5 . G5 . C6 - G5 . E5 . G5 . A5 . F5 . D5 . F5 . A5 . G5 . E5 . C5 . E5 . G5 . F5 . D5 . B4 . D5 . C5 . G4 . C5 - - -`),
    bass: s(`C3 . G3 . C3 . G3 . F2 . C3 . F2 . C3 . C3 . G3 . C3 . G3 . G2 . D3 . G2 . D3 . C3 . G3 . C3 . G3 . F2 . C3 . F2 . C3 . G2 . D3 . G2 . D3 . C3 . G3 . C3 .
             C3 . G3 . C3 . G3 . F2 . C3 . F2 . C3 . C3 . G3 . C3 . G3 . G2 . D3 . G2 . D3 . C3 . G3 . C3 . G3 . G2 . D3 . G2 . D3 . C3 . G3 . C3 . G3 . C3 . . .`),
    drums: 'k . h . s . h . k . h . s . h h',
  },
  shanty: {
    id: 'shanty', bpm: 104, stepsPerBeat: 3, leadWave: 'pulse25', bassWave: 'triangle', gain: 0.95,
    lead: s(`D4 . F4 A4 - G4 F4 . E4 D4 - . C4 . D4 E4 . F4 G4 - E4 C4 - . D4 . F4 A4 - C5 D5 - C5 A4 - G4 F4 . E4 D4 - - - - -
             A4 . A4 C5 . A4 G4 . E4 C4 - . D4 . E4 F4 . G4 A4 - G4 F4 . E4 D4 . F4 A4 - G4 F4 . E4 C4 . E4 D4 - - - - -`),
    bass: s(`D2 . . A2 . . D2 . . A2 . . C2 . . G2 . . C2 . . G2 . . D2 . . A2 . . C2 . . G2 . . D2 . . A2 . . D2 . . . . .
             F2 . . C3 . . D2 . . A2 . . C2 . . G2 . . D2 . . A2 . . F2 . . C3 . . C2 . . G2 . . D2 . . A2 . . D2 . . . . .`),
    drums: 'k . h s . h',
  },
  'providence-day': {
    id: 'providence-day', bpm: 76, stepsPerBeat: 4, leadWave: 'bell', bassWave: 'triangle', gain: 0.8,
    lead: s(`F5 - - - . . A5 - - - . . C6 - - - B5 - - - . . G5 - - - . . E5 - - - F5 - - - . . . . A5 - - - G5 - - - . . . .
             C5 - - - . . E5 - - - . . G5 - - - F#5 - - - . . E5 - - - . . D5 - - - C5 - - - . . . . . . . . . . . . . . . .`),
    bass: s(`F2 - - - - - - - - - - - - - - - C3 - - - - - - - - - - - - - - - D3 - - - - - - - - - - - - - - - C3 - - - - - - - - - - - - - - -`),
    drums: '. . . . . . . . . . . . . . . .',
    harmony: s(`. . . . A4 - - - . . . . . . . . . . . . G4 - - - . . . . . . . . . . . . F#4 - - - . . . . . . . . . . . . E4 - - - . . . . . . . .`),
    harmonyWave: 'bell',
  },
  'providence-night': {
    id: 'providence-night', bpm: 150, stepsPerBeat: 3, leadWave: 'square', bassWave: 'triangle', gain: 0.9,
    lead: s(`A4 . C5 E5 - D5 C5 . B4 A4 . E4 A4 . C5 E5 . A5 G5 - E5 C5 . D5 E5 - - - - - D5 . F5 A5 - G5 F5 . E5 D5 . C5 B4 . D5 G5 - F5 E5 . D5 C5 . B4 A4 - - - - -`),
    bass: s(`A2 . E3 E3 . . A2 . E3 E3 . . D2 . A2 A2 . . E2 . B2 B2 . . A2 . E3 E3 . . D2 . A2 A2 . . E2 . B2 B2 . . A2 . E3 E3 . .`),
    drums: 'k . . h . h',
  },
  roto: {
    id: 'roto', bpm: 118, stepsPerBeat: 4, leadWave: 'pulse12', bassWave: 'square', gain: 0.85,
    lead: s(`E5 . F5 . G#5 . A5 . G#5 . F5 . E5 . . . E5 F5 E5 . D5 . C5 . B4 . C5 . D5 . E5 - . . E5 . G#5 . B5 . A5 . G#5 . F5 . E5 . F5 E5 D5 . C5 . B4 . A4 . B4 . C5 . B4 - . .
             A4 . B4 . C5 . D5 . E5 . F5 . E5 . . . G#5 . F5 . E5 . D5 . C5 . D5 . C5 . B4 . A4 - . . E5 . . E5 F5 . E5 . D5 . C5 . B4 . C5 . D5 . C5 . B4 . A4 . G#4 . E4 - . .`),
    bass: s(`E2 . . E2 . . E3 . E2 . . E2 . . F2 . E2 . . E2 . . E3 . E2 . . D2 . . E2 . A2 . . A2 . . A3 . A2 . . G2 . . F2 . E2 . . E2 . . E3 . E2 . . E2 . . E2 .`),
    drums: 'k h s h k h h s k h s h k s h h',
  },
  world: {
    id: 'world', bpm: 66, stepsPerBeat: 4, leadWave: 'triangle', bassWave: 'triangle', gain: 0.7,
    lead: s(`E5 - - - - - - - D5 - - - B4 - - - C5 - - - - - - - . . . . . . . . A4 - - - - - - - B4 - - - G4 - - - A4 - - - - - - - . . . . . . . .`),
    bass: s(`A2 - - - - - - - - - - - - - - - F2 - - - - - - - - - - - - - - - D2 - - - - - - - - - - - - - - - E2 - - - - - - - - - - - - - - -`),
    drums: '. . . . . . . . . . . . . . . .',
    harmony: s(`C4 - - - - - - - - - - - - - - - A3 - - - - - - - - - - - - - - - F3 - - - - - - - - - - - - - - - G#3 - - - - - - - - - - - - - - -`),
    harmonyWave: 'triangle',
  },
  title: {
    id: 'title', bpm: 92, stepsPerBeat: 3, leadWave: 'pulse25', bassWave: 'triangle', gain: 0.75,
    lead: s(`C5 . E5 G5 - - F5 . E5 D5 - - E5 . C5 A4 - - B4 . C5 D5 - - C5 . E5 G5 - - A5 . G5 F5 - - E5 . D5 C5 - - C5 - - - - -`),
    bass: s(`C3 . . G2 . . F2 . . G2 . . A2 . . E2 . . G2 . . G2 . . C3 . . G2 . . F2 . . F2 . . G2 . . G2 . . C3 . . . . .`),
    drums: 'k . h s . h',
  },
};
