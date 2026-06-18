interface AnimationPlaySetting {
  play: {
    value: boolean;
  };
}

interface PersistPropertiesHost {
  persistProperties: (changes: {
    merge: Array<{
      objectName: string;
      selector: null;
      properties: { play: boolean };
    }>;
  }) => void;
}

export const syncCompletedAnimationPlayback = (
  animation: AnimationPlaySetting,
  host: PersistPropertiesHost,
): boolean => {
  if (animation.play.value === false) {
    return false;
  }

  animation.play.value = false;
  host.persistProperties({
    merge: [
      {
        objectName: "animationProps",
        selector: null,
        properties: { play: false },
      },
    ],
  });
  return true;
};
