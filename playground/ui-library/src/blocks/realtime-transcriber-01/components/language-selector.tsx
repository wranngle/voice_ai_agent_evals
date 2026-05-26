"use client"

import { useState } from "react"
import { ChevronDown, Globe } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface LanguageOption {
  code: string
  name: string
}

const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: "af", name: "Afrikaans" },
  { code: "ar", name: "Arabic" },
  { code: "hy", name: "Armenian" },
  { code: "az", name: "Azerbaijani" },
  { code: "be", name: "Belarusian" },
  { code: "bn", name: "Bengali" },
  { code: "bs", name: "Bosnian" },
  { code: "bg", name: "Bulgarian" },
  { code: "ca", name: "Catalan" },
  { code: "zh", name: "Chinese" },
  { code: "hr", name: "Croatian" },
  { code: "cs", name: "Czech" },
  { code: "da", name: "Danish" },
  { code: "nl", name: "Dutch" },
  { code: "en", name: "English" },
  { code: "et", name: "Estonian" },
  { code: "fi", name: "Finnish" },
  { code: "fr", name: "French" },
  { code: "gl", name: "Galician" },
  { code: "ka", name: "Georgian" },
  { code: "de", name: "German" },
  { code: "el", name: "Greek" },
  { code: "gu", name: "Gujarati" },
  { code: "he", name: "Hebrew" },
  { code: "hi", name: "Hindi" },
  { code: "hu", name: "Hungarian" },
  { code: "is", name: "Icelandic" },
  { code: "id", name: "Indonesian" },
  { code: "it", name: "Italian" },
  { code: "ja", name: "Japanese" },
  { code: "kn", name: "Kannada" },
  { code: "kk", name: "Kazakh" },
  { code: "ko", name: "Korean" },
  { code: "lv", name: "Latvian" },
  { code: "lt", name: "Lithuanian" },
  { code: "mk", name: "Macedonian" },
  { code: "ms", name: "Malay" },
  { code: "ml", name: "Malayalam" },
  { code: "mr", name: "Marathi" },
  { code: "ne", name: "Nepali" },
  { code: "no", name: "Norwegian" },
  { code: "fa", name: "Persian" },
  { code: "pl", name: "Polish" },
  { code: "pt", name: "Portuguese" },
  { code: "ro", name: "Romanian" },
  { code: "ru", name: "Russian" },
  { code: "sr", name: "Serbian" },
  { code: "sk", name: "Slovak" },
  { code: "sl", name: "Slovenian" },
  { code: "es", name: "Spanish" },
  { code: "sw", name: "Swahili" },
  { code: "sv", name: "Swedish" },
  { code: "ta", name: "Tamil" },
  { code: "te", name: "Telugu" },
  { code: "th", name: "Thai" },
  { code: "tr", name: "Turkish" },
  { code: "uk", name: "Ukrainian" },
  { code: "ur", name: "Urdu" },
  { code: "vi", name: "Vietnamese" },
]

interface LanguageSelectorProps {
  value: string | null
  onValueChange: (code: string | null) => void
  disabled?: boolean
}

export function LanguageSelector({
  value,
  onValueChange,
  disabled = false,
}: LanguageSelectorProps) {
  const [open, setOpen] = useState(false)

  const selectedName = value
    ? LANGUAGE_OPTIONS.find((l) => l.code === value)?.name || value
    : "Auto-detect"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled}
        >
          <span className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            {selectedName}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search languages..." />
          <CommandList>
            <CommandEmpty>No language found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="auto-detect"
                onSelect={() => {
                  onValueChange(null)
                  setOpen(false)
                }}
              >
                <Globe className="mr-2 h-4 w-4" />
                Auto-detect
              </CommandItem>
              {LANGUAGE_OPTIONS.map((language) => (
                <CommandItem
                  key={language.code}
                  value={`${language.name} ${language.code}`}
                  onSelect={() => {
                    onValueChange(language.code)
                    setOpen(false)
                  }}
                >
                  {language.name} ({language.code})
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
