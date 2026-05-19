/**
 * Emoji Picker Component
 * Simple emoji picker for message reactions
 */


interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

const COMMON_EMOJIS = [
  '👍', '❤️', '😊', '😂', '🎉', '👏',
  '🔥', '✅', '💪', '⚽', '🏒', '🏀',
  '👀', '🙏', '💯', '🎯', '⭐', '🚀',
  '😎', '💙', '🏆', '⚡', '👊', '🤝',
];

export default function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />

      {/* Picker */}
      <div className="absolute bottom-full left-0 mb-2 bg-app-card border border-white/10 rounded-lg shadow-2xl p-2 z-50 w-64">
        <div className="grid grid-cols-6 gap-1">
          {COMMON_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                onSelect(emoji);
                onClose();
              }}
              className="text-2xl p-2 hover:bg-white/10 rounded transition-colors"
              type="button"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
