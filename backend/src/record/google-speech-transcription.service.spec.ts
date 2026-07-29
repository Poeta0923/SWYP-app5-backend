import { groupWordsBySpeaker } from './google-speech-transcription.service';

describe('groupWordsBySpeaker', () => {
  it('groups consecutive words with the same speaker into one segment', () => {
    const segments = groupWordsBySpeaker([
      { word: '안녕하세요', speakerTag: 1 },
      { word: '오늘', speakerTag: 1 },
      { word: '반갑습니다', speakerTag: 2 },
      { word: '네', speakerTag: 1 },
    ]);

    expect(segments).toEqual([
      { speaker: 1, text: '안녕하세요 오늘' },
      { speaker: 2, text: '반갑습니다' },
      { speaker: 1, text: '네' },
    ]);
  });

  it('skips empty/whitespace words and treats a missing speakerTag as 0', () => {
    const segments = groupWordsBySpeaker([
      { word: '  ', speakerTag: 1 },
      { word: '하나', speakerTag: undefined },
      { word: '둘', speakerTag: undefined },
    ]);

    expect(segments).toEqual([{ speaker: 0, text: '하나 둘' }]);
  });

  it('returns an empty array when there are no words', () => {
    expect(groupWordsBySpeaker([])).toEqual([]);
  });
});
