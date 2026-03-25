"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  memo,
  useMemo,
} from "react";
import { Plus } from "lucide-react";

// ===== TYPES =====

type MenuOption = "Auto" | "Max" | "Search" | "Plan";

interface RippleEffect {
  x: number;
  y: number;
  id: number;
}

interface Position {
  x: number;
  y: number;
}

interface ChatInputProps {
  placeholder?: string;
  onSubmit?: (value: string) => void;
  disabled?: boolean;
  glowIntensity?: number;
  expandOnFocus?: boolean;
  animationDuration?: number;
  textColor?: string;
  backgroundOpacity?: number;
  showEffects?: boolean;
  menuOptions?: MenuOption[];
}

interface InputAreaProps {
  value: string;
  setValue: React.Dispatch<React.SetStateAction<string>>;
  placeholder: string;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  disabled: boolean;
  isSubmitDisabled: boolean;
  textColor: string;
}

interface GlowEffectsProps {
  glowIntensity: number;
  mousePosition: Position;
  animationDuration: number;
  enabled: boolean;
}

interface RippleEffectsProps {
  ripples: RippleEffect[];
  enabled: boolean;
}

interface MenuButtonProps {
  toggleMenu: () => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
  isMenuOpen: boolean;
  onSelectOption: (option: MenuOption) => void;
  textColor: string;
  menuOptions: MenuOption[];
}

interface SelectedOptionsProps {
  options: MenuOption[];
  onRemove: (option: MenuOption) => void;
  textColor: string;
}

interface SendButtonProps {
  isDisabled: boolean;
  textColor: string;
}

interface OptionsMenuProps {
  isOpen: boolean;
  onSelect: (option: MenuOption) => void;
  textColor: string;
  menuOptions: MenuOption[];
}

interface OptionTagProps {
  option: MenuOption;
  onRemove: (option: MenuOption) => void;
  textColor: string;
}

// ===== CONTEXT =====

interface ChatInputContextProps {
  mousePosition: Position;
  ripples: RippleEffect[];
  addRipple: (x: number, y: number) => void;
  animationDuration: number;
  glowIntensity: number;
  textColor: string;
  showEffects: boolean;
}

const ChatInputContext = createContext<ChatInputContextProps | undefined>(
  undefined
);

// ===== COMPONENTS =====

const SendButton = memo(function SendButton({
  isDisabled,
}: SendButtonProps) {
  return (
    <button
      type="submit"
      aria-label="메시지 전송"
      disabled={isDisabled}
      className={`ml-auto self-center h-8 w-8 flex items-center justify-center rounded-full border-0 p-0 transition-all z-20 ${
        isDisabled
          ? "opacity-40 cursor-not-allowed bg-gray-600 text-white/60"
          : "opacity-90 bg-[#fafafa] text-[#0a0a0a] hover:opacity-100 cursor-pointer hover:shadow-lg"
      }`}
    >
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`block ${isDisabled ? "opacity-50" : "opacity-100"}`}
      >
        <path
          d="M16 22L16 10M16 10L11 15M16 10L21 15"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
});

const OptionsMenu = memo(function OptionsMenu({
  isOpen,
  onSelect,
  menuOptions,
}: OptionsMenuProps) {
  if (!isOpen) return null;

  return (
    <div className="absolute bottom-full left-0 mb-1 bg-[#1a1a1a] border border-[#27272a] rounded-lg shadow-lg overflow-hidden z-30 min-w-[120px]">
      <ul className="py-1">
        {menuOptions.map((option) => (
          <li
            key={option}
            className="px-4 py-2 hover:bg-[#27272a] cursor-pointer text-[#fafafa] text-sm font-medium"
            onClick={() => onSelect(option)}
          >
            {option}
          </li>
        ))}
      </ul>
    </div>
  );
});

const OptionTag = memo(function OptionTag({
  option,
  onRemove,
}: OptionTagProps) {
  return (
    <div className="flex items-center gap-1 bg-[#fafafa]/10 px-2 py-1 rounded-md text-xs text-[#fafafa]">
      <span>{option}</span>
      <button
        type="button"
        onClick={() => onRemove(option)}
        className="h-4 w-4 flex items-center justify-center rounded-full hover:bg-[#fafafa]/20 text-[#fafafa]/70 cursor-pointer"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M18 6L6 18M6 6l12 12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
});

const GlowEffects = memo(function GlowEffects({
  glowIntensity,
  mousePosition,
  animationDuration,
  enabled,
}: GlowEffectsProps) {
  if (!enabled) return null;

  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-r from-white/[0.03] via-white/[0.05] to-white/[0.03] backdrop-blur-2xl rounded-3xl" />

      <div
        className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pointer-events-none"
        style={{
          transitionDuration: `${animationDuration}ms`,
          boxShadow: `
            0 0 0 1px rgba(147, 51, 234, ${0.2 * glowIntensity}),
            0 0 8px rgba(147, 51, 234, ${0.3 * glowIntensity}),
            0 0 16px rgba(236, 72, 153, ${0.2 * glowIntensity}),
            0 0 24px rgba(59, 130, 246, ${0.15 * glowIntensity})
          `,
        }}
      />

      <div
        className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-20 transition-opacity duration-300 pointer-events-none blur-sm"
        style={{
          background: `radial-gradient(circle 120px at ${mousePosition.x}% ${mousePosition.y}%, rgba(147,51,234,0.08) 0%, rgba(236,72,153,0.05) 30%, rgba(59,130,246,0.04) 60%, transparent 100%)`,
        }}
      />

      <div className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-15 group-focus-within:opacity-10 transition-opacity duration-300 bg-gradient-to-r from-purple-400/5 via-pink-400/5 to-blue-400/5 blur-sm" />
    </>
  );
});

const RippleEffects = memo(function RippleEffects({
  ripples,
  enabled,
}: RippleEffectsProps) {
  if (!enabled || ripples.length === 0) return null;

  return (
    <>
      {ripples.map((ripple) => (
        <div
          key={ripple.id}
          className="absolute pointer-events-none blur-sm"
          style={{
            left: ripple.x - 25,
            top: ripple.y - 25,
            width: 50,
            height: 50,
          }}
        >
          <div className="w-full h-full rounded-full bg-gradient-to-r from-purple-400/15 via-pink-400/10 to-blue-400/15 animate-ping" />
        </div>
      ))}
    </>
  );
});

const InputArea = memo(function InputArea({
  value,
  setValue,
  placeholder,
  handleKeyDown,
  disabled,
  isSubmitDisabled,
  textColor,
}: InputAreaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxHeight = 22 * 4 + 16;
      textareaRef.current.style.height =
        Math.min(scrollHeight, maxHeight) + "px";
    }
  }, [value]);

  return (
    <div className="flex-1 relative h-full flex items-center">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label="메시지 입력"
        rows={1}
        className="w-full min-h-8 max-h-24 bg-transparent text-sm font-normal text-left self-center placeholder-[#6B7280] border-0 outline-none px-3 pr-10 py-1 z-20 relative resize-none overflow-y-auto"
        style={{
          color: textColor,
          fontFamily: '"Inter", sans-serif',
          letterSpacing: "-0.14px",
          lineHeight: "22px",
        }}
        disabled={disabled}
      />
      <SendButton isDisabled={isSubmitDisabled} textColor={textColor} />
    </div>
  );
});

const MenuButton = memo(function MenuButton({
  toggleMenu,
  menuRef,
  isMenuOpen,
  onSelectOption,
  textColor,
  menuOptions,
}: MenuButtonProps) {
  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={toggleMenu}
        aria-label="메뉴 옵션"
        className="h-8 w-8 flex items-center justify-center rounded-full bg-[#fafafa]/10 hover:bg-[#fafafa]/20 text-[#fafafa] transition-all ml-1 mr-1 cursor-pointer"
      >
        <Plus size={16} />
      </button>
      <OptionsMenu
        isOpen={isMenuOpen}
        onSelect={onSelectOption}
        textColor={textColor}
        menuOptions={menuOptions}
      />
    </div>
  );
});

const SelectedOptions = memo(function SelectedOptions({
  options,
  onRemove,
  textColor,
}: SelectedOptionsProps) {
  if (options.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-2 pl-3 pr-3 z-20 relative">
      {options.map((option) => (
        <OptionTag
          key={option}
          option={option}
          onRemove={onRemove}
          textColor={textColor}
        />
      ))}
    </div>
  );
});

// ===== MAIN COMPONENT =====

export default function ChatInput({
  placeholder = "메시지를 입력하세요...",
  onSubmit,
  disabled = false,
  glowIntensity = 0.4,
  expandOnFocus = true,
  animationDuration = 500,
  textColor = "#fafafa",
  backgroundOpacity = 0.08,
  showEffects = true,
  menuOptions = ["Auto", "Max", "Search", "Plan"] as MenuOption[],
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState<MenuOption[]>([]);
  const [ripples, setRipples] = useState<RippleEffect[]>([]);
  const [mousePosition, setMousePosition] = useState<Position>({
    x: 50,
    y: 50,
  });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const throttleRef = useRef<number | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (value.trim() && onSubmit && !disabled) {
        onSubmit(value.trim());
        setValue("");
      }
    },
    [value, onSubmit, disabled]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e as unknown as React.FormEvent);
      }
    },
    [handleSubmit]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!showEffects) return;
      if (containerRef.current && !throttleRef.current) {
        throttleRef.current = window.setTimeout(() => {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            setMousePosition({ x, y });
          }
          throttleRef.current = null;
        }, 50);
      }
    },
    [showEffects]
  );

  const addRipple = useCallback(
    (x: number, y: number) => {
      if (!showEffects || ripples.length >= 5) return;
      const newRipple: RippleEffect = { x, y, id: Date.now() };
      setRipples((prev) => [...prev, newRipple]);
      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
      }, 600);
    },
    [ripples, showEffects]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        addRipple(e.clientX - rect.left, e.clientY - rect.top);
      }
    },
    [addRipple]
  );

  const toggleMenu = useCallback(() => setIsMenuOpen((prev) => !prev), []);

  const selectOption = useCallback((option: MenuOption) => {
    setSelectedOptions((prev) =>
      prev.includes(option) ? prev : [...prev, option]
    );
    setIsMenuOpen(false);
  }, []);

  const removeOption = useCallback((option: MenuOption) => {
    setSelectedOptions((prev) => prev.filter((o) => o !== option));
  }, []);

  const contextValue = useMemo(
    () => ({
      mousePosition,
      ripples,
      addRipple,
      animationDuration,
      glowIntensity,
      textColor,
      showEffects,
    }),
    [
      mousePosition,
      ripples,
      addRipple,
      animationDuration,
      glowIntensity,
      textColor,
      showEffects,
    ]
  );

  const isSubmitDisabled = disabled || !value.trim();
  const hasModeSelected = selectedOptions.length > 0;
  const shouldExpandOnFocus = expandOnFocus && !hasModeSelected;

  return (
    <ChatInputContext.Provider value={contextValue}>
      <form
        onSubmit={handleSubmit}
        className={`w-full max-w-3xl mx-auto px-4 pb-4 pt-2`}
      >
        <div
          ref={containerRef}
          onMouseMove={handleMouseMove}
          onClick={handleClick}
          className="relative flex flex-col w-full min-h-full backdrop-blur-xl shadow-lg rounded-3xl p-2 overflow-visible group transition-all"
          style={{
            background: `rgba(255, 255, 255, ${backgroundOpacity})`,
            boxShadow:
              "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
            transitionDuration: `${animationDuration}ms`,
          }}
        >
          <GlowEffects
            glowIntensity={glowIntensity}
            mousePosition={mousePosition}
            animationDuration={animationDuration}
            enabled={showEffects}
          />
          <RippleEffects ripples={ripples} enabled={showEffects} />

          <div className="flex items-center relative z-20">
            <MenuButton
              toggleMenu={toggleMenu}
              menuRef={menuRef}
              isMenuOpen={isMenuOpen}
              onSelectOption={selectOption}
              textColor={textColor}
              menuOptions={menuOptions}
            />
            <InputArea
              value={value}
              setValue={setValue}
              placeholder={placeholder}
              handleKeyDown={handleKeyDown}
              disabled={disabled}
              isSubmitDisabled={isSubmitDisabled}
              textColor={textColor}
            />
          </div>

          <SelectedOptions
            options={selectedOptions}
            onRemove={removeOption}
            textColor={textColor}
          />
        </div>
      </form>
    </ChatInputContext.Provider>
  );
}
