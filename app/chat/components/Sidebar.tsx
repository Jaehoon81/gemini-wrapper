"use client";

import { useState } from "react";
import { Plus, MessageSquare, Trash2 } from "lucide-react";

interface Conversation {
  id: string;
  title: string;
  date: string;
}

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
}

export default function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onDelete,
}: SidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <aside className="w-80 flex-shrink-0 flex flex-col bg-[#1e1f20]">
      {/* 새 대화 버튼 */}
      <div className="p-3">
        <button
          onClick={onNewChat}
          className="flex w-full items-center gap-2 rounded-lg border border-[#383a3e] px-3 py-2.5 text-sm text-[#e3e3e3] transition-colors hover:bg-[#2a2b2e] cursor-pointer"
        >
          <Plus size={16} />
          새 대화
        </button>
      </div>

      {/* 대화 목록 */}
      <nav className="flex-1 overflow-y-auto px-2 pb-3">
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className="relative group"
            onMouseEnter={() => setHoveredId(conv.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <button
              onClick={() => onSelect(conv.id)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors cursor-pointer mb-0.5 ${
                activeId === conv.id
                  ? "bg-[#2a2b2e] text-[#e3e3e3]"
                  : "text-[#9aa0a6] hover:bg-[#262729] hover:text-[#e3e3e3]"
              }`}
            >
              <MessageSquare size={14} className="flex-shrink-0" />
              <span className="truncate pr-6">{conv.title}</span>
            </button>

            {/* 삭제 버튼 */}
            {hoveredId === conv.id && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(conv.id);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[#9aa0a6] hover:text-red-400 hover:bg-[#2a2b2e] transition-colors cursor-pointer"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </nav>
    </aside>
  );
}
