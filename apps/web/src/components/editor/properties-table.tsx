"use client";

import { Button } from "@avenire/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@avenire/ui/components/dropdown-menu";
import { Input } from "@avenire/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@avenire/ui/components/select";
import {
  ChevronDown as ChevronDownIcon,
  ChevronRight,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  COMMON_PROPERTIES,
  type FrontmatterProperties,
  formatValue,
  PRIORITY_OPTIONS,
  parseFrontmatter,
  parseValue,
  STATUS_OPTIONS,
  TYPE_OPTIONS,
  updateContentWithFrontmatter,
} from "@/lib/frontmatter";

interface PropertiesTableProps {
  content: string;
  onChange: (newContent: string) => void;
}

export function PropertiesTable({ content, onChange }: PropertiesTableProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [properties, setProperties] = useState<FrontmatterProperties>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const contentRef = useRef(content);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    const parsed = parseFrontmatter(content);
    setProperties(parsed.properties);
  }, [content]);

  const handlePropertyChange = useCallback(
    (key: string, value: string, type?: string) => {
      const newProperties = {
        ...properties,
        [key]: parseValue(value, type),
      };
      setProperties(newProperties);
      const newContent = updateContentWithFrontmatter(
        contentRef.current,
        newProperties
      );
      onChange(newContent);
    },
    [onChange, properties]
  );

  const handleAddProperty = useCallback(
    (key: string) => {
      const prop = COMMON_PROPERTIES.find((p) => p.key === key);
      if (!prop) {
        return;
      }

      const newProperties = {
        ...properties,
        [key]: prop.type === "array" ? [] : "",
      };
      setProperties(newProperties);
      const newContent = updateContentWithFrontmatter(
        contentRef.current,
        newProperties
      );
      onChange(newContent);
      setEditingKey(key);
    },
    [onChange, properties]
  );

  const handleDeleteProperty = useCallback(
    (key: string) => {
      const { [key]: _, ...newProperties } = properties;
      setProperties(newProperties);
      const newContent = updateContentWithFrontmatter(
        contentRef.current,
        newProperties
      );
      onChange(newContent);
    },
    [onChange, properties]
  );

  const existingKeys = Object.keys(properties);
  const availableProperties = COMMON_PROPERTIES.filter(
    (p) => !existingKeys.includes(p.key)
  );

  const getPropertyType = (key: string): string => {
    const prop = COMMON_PROPERTIES.find((p) => p.key === key);
    return prop?.type || "string";
  };

  const getSelectOptions = (key: string): string[] => {
    if (key === "status") {
      return STATUS_OPTIONS;
    }
    if (key === "type") {
      return TYPE_OPTIONS;
    }
    if (key === "priority") {
      return PRIORITY_OPTIONS;
    }
    return [];
  };

  if (existingKeys.length === 0 && availableProperties.length === 0) {
    return (
      <div className="mb-2 border-border/50 border-b px-4 pb-2 pt-3">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                className="text-muted-foreground"
                size="sm"
                variant="ghost"
              />
            }
          >
            <Plus className="mr-1 h-3 w-3" />
            Add properties
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {COMMON_PROPERTIES.map((prop) => (
              <DropdownMenuItem
                key={prop.key}
                onClick={() => handleAddProperty(prop.key)}
              >
                {prop.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <div className="mb-2 border-border/50 border-b px-4 pb-2 pt-3">
      <button
        className="mb-2 flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDownIcon className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        Properties {isExpanded && `(${existingKeys.length})`}
      </button>

      {isExpanded && (
        <div className="space-y-1">
          {existingKeys.map((key) => (
            <div className="flex items-center gap-2 text-sm" key={key}>
              <span className="w-24 shrink-0 truncate text-muted-foreground">
                {key}
              </span>
              {editingKey === key || getSelectOptions(key).length === 0 ? (
                <Input
                  autoFocus
                  className="h-6 text-xs"
                  onBlur={() => setEditingKey(null)}
                  onChange={(e) =>
                    handlePropertyChange(
                      key,
                      e.target.value,
                      getPropertyType(key)
                    )
                  }
                  value={formatValue(properties[key])}
                />
              ) : (
                <Select
                  onValueChange={(value) =>
                    handlePropertyChange(key, value ?? "", getPropertyType(key))
                  }
                  value={String(properties[key] ?? "")}
                >
                  <SelectTrigger className="h-6 flex-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getSelectOptions(key).map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                className="h-5 w-5 text-muted-foreground hover:text-destructive"
                onClick={() => handleDeleteProperty(key)}
                size="icon"
                variant="ghost"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}

          <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                className="mt-1 text-muted-foreground text-xs"
                size="sm"
                variant="ghost"
              />
            }
          >
            <Plus className="mr-1 h-3 w-3" />
            Add property
          </DropdownMenuTrigger>
            <DropdownMenuContent>
              {availableProperties.map((prop) => (
                <DropdownMenuItem
                  key={prop.key}
                  onClick={() => handleAddProperty(prop.key)}
                >
                  {prop.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
