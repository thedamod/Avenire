"use client";

import { Button } from "@avenire/ui/components/button";
import { Checkbox } from "@avenire/ui/components/checkbox";
import { Input } from "@avenire/ui/components/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@avenire/ui/components/select";
import {
  CaretDown as ChevronDown, CaretRight as ChevronRight, Plus, Trash as Trash2 } from "@phosphor-icons/react"
import { useCallback, useMemo, useState } from "react";
import {
  createEmptyProperty,
  formatPropertyValue,
  normalizePropertyOptions,
  PROPERTY_TYPE_LABELS,
  type FilePropertyType,
  type FrontmatterProperties,
  setPropertyValue,
  type WorkspacePropertyDefinition,
} from "@/lib/frontmatter";
import { cn } from "@/lib/utils";

interface PropertiesTableProps {
  className?: string;
  definitions?: WorkspacePropertyDefinition[];
  disabled?: boolean;
  onChange: (properties: FrontmatterProperties) => void;
  onDefinitionsChange?: (definitions: WorkspacePropertyDefinition[]) => void;
  properties: FrontmatterProperties;
}

const PROPERTY_TYPES: FilePropertyType[] = [
  "text",
  "number",
  "checkbox",
  "date",
  "select",
  "multi_select",
];

export function PropertiesTable({
  className,
  definitions = [],
  disabled = false,
  onChange,
  onDefinitionsChange,
  properties,
}: PropertiesTableProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [newKey, setNewKey] = useState("");
  const [newType, setNewType] = useState<FilePropertyType>("text");

  const definitionByKey = useMemo(
    () => new Map(definitions.map((definition) => [definition.key, definition])),
    [definitions]
  );

  const syncDefinition = useCallback(
    (key: string, type: FilePropertyType, options: string[] = []) => {
      if (!onDefinitionsChange) {
        return;
      }

      const trimmedKey = key.trim();
      if (!trimmedKey) {
        return;
      }

      const nextOptions = normalizePropertyOptions(options);
      const nextDefinitions = [...definitions];
      const existingIndex = nextDefinitions.findIndex(
        (definition) => definition.key === trimmedKey
      );

      if (existingIndex >= 0) {
        nextDefinitions[existingIndex] = {
          ...nextDefinitions[existingIndex],
          key: trimmedKey,
          options:
            type === "select" || type === "multi_select"
              ? normalizePropertyOptions([
                  ...nextDefinitions[existingIndex]!.options,
                  ...nextOptions,
                ])
              : [],
          type,
        };
      } else {
        nextDefinitions.push({
          key: trimmedKey,
          options:
            type === "select" || type === "multi_select" ? nextOptions : [],
          type,
        });
      }

      onDefinitionsChange(
        nextDefinitions.sort((left, right) => left.key.localeCompare(right.key))
      );
    },
    [definitions, onDefinitionsChange]
  );

  const handleAddProperty = useCallback(() => {
    const trimmedKey = newKey.trim();
    if (!(trimmedKey && !properties[trimmedKey])) {
      return;
    }

    onChange({
      ...properties,
      [trimmedKey]: createEmptyProperty(newType),
    });
    syncDefinition(trimmedKey, newType);
    setNewKey("");
    setNewType("text");
  }, [newKey, newType, onChange, properties, syncDefinition]);

  const handleDeleteProperty = useCallback(
    (key: string) => {
      const { [key]: _removed, ...rest } = properties;
      onChange(rest);
    },
    [onChange, properties]
  );

  const handleRenameProperty = useCallback(
    (key: string, nextKey: string) => {
      const trimmedKey = nextKey.trim();
      if (!(trimmedKey && trimmedKey !== key && !properties[trimmedKey])) {
        return;
      }

      const nextEntries = Object.entries(properties).map(([entryKey, value]) =>
        entryKey === key ? ([trimmedKey, value] as const) : ([entryKey, value] as const)
      );
      onChange(Object.fromEntries(nextEntries));

      const definition = definitionByKey.get(key);
      if (definition && onDefinitionsChange) {
        onDefinitionsChange(
          definitions
            .map((entry) =>
              entry.key === key ? { ...entry, key: trimmedKey } : entry
            )
            .sort((left, right) => left.key.localeCompare(right.key))
        );
      }
    },
    [
      definitionByKey,
      definitions,
      onChange,
      onDefinitionsChange,
      properties,
    ]
  );

  const handlePropertyValueChange = useCallback(
    (key: string, nextValue: unknown) => {
      const property = properties[key];
      if (!property) {
        return;
      }

      const nextProperty = setPropertyValue(property, nextValue);
      onChange({
        ...properties,
        [key]: nextProperty,
      });

      if (nextProperty.type === "select" && nextProperty.value) {
        syncDefinition(key, nextProperty.type, [nextProperty.value]);
      }
      if (nextProperty.type === "multi_select") {
        syncDefinition(key, nextProperty.type, nextProperty.value);
      }
    },
    [onChange, properties, syncDefinition]
  );

  const entries = Object.entries(properties);

  return (
    <div
      className={cn(
        "mb-2 border-border/50 border-b px-4 pb-2 pt-3 sm:px-10",
        "mx-auto max-w-[50rem]",
        className
      )}
    >
      <button
        className="mb-2 flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
        onClick={() => setIsExpanded((current) => !current)}
        type="button"
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        Properties {isExpanded ? `(${entries.length})` : ""}
      </button>

      {isExpanded ? (
        <div className="space-y-2">
          {entries.length === 0 ? (
            <div className="text-muted-foreground text-xs">
              No properties on this file.
            </div>
          ) : null}

          {entries.map(([key, property]) => {
            const definition = definitionByKey.get(key);
            const options =
              property.type === "select" || property.type === "multi_select"
                ? normalizePropertyOptions([
                    ...(definition?.options ?? []),
                    ...(property.type === "select" && property.value
                      ? [property.value]
                      : []),
                    ...(property.type === "multi_select" ? property.value : []),
                  ])
                : [];

            return (
              <div
                className="grid grid-cols-[minmax(0,1fr)_7.5rem_2rem] items-center gap-2 text-sm lg:grid-cols-[minmax(0,11rem)_8rem_minmax(0,1fr)_2rem]"
                key={key}
              >
                <Input
                  className="h-8 min-w-0 text-xs"
                  defaultValue={key}
                  disabled={disabled}
                  onBlur={(event) =>
                    handleRenameProperty(key, event.currentTarget.value)
                  }
                />
                <div className="min-w-0 truncate rounded-md border border-border/70 px-2 py-1 text-[11px] text-muted-foreground">
                  {PROPERTY_TYPE_LABELS[property.type]}
                </div>
                <Button
                  className="h-8 w-8"
                  disabled={disabled}
                  onClick={() => handleDeleteProperty(key)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
                <div className="col-span-3 min-w-0 lg:col-span-1">
                  {property.type === "checkbox" ? (
                    <div className="flex h-8 items-center rounded-md border border-border/70 px-3">
                      <Checkbox
                        checked={property.value}
                        disabled={disabled}
                        onCheckedChange={(checked) =>
                          handlePropertyValueChange(key, checked === true)
                        }
                      />
                    </div>
                  ) : property.type === "select" ? (
                    <Select
                      disabled={disabled}
                      onValueChange={(value) =>
                        handlePropertyValueChange(key, value)
                      }
                      value={property.value ?? ""}
                    >
                      <SelectTrigger className="h-8 min-w-0 text-xs">
                        <SelectValue placeholder="Select value" />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      className="h-8 min-w-0 text-xs"
                      disabled={disabled}
                      onChange={(event) =>
                        handlePropertyValueChange(key, event.currentTarget.value)
                      }
                      placeholder={
                        property.type === "multi_select"
                          ? "comma, separated, values"
                          : property.type === "date"
                            ? "YYYY-MM-DD"
                            : "Value"
                      }
                      value={formatPropertyValue(property)}
                    />
                  )}
                </div>
              </div>
            );
          })}

          <div className="grid grid-cols-[minmax(0,1fr)_4rem] items-center gap-2 pt-1 lg:grid-cols-[minmax(0,11rem)_8rem_1fr]">
            <Input
              className="h-8 min-w-0 text-xs"
              disabled={disabled}
              onChange={(event) => setNewKey(event.currentTarget.value)}
              placeholder="New property"
              value={newKey}
            />
            <Select
              disabled={disabled}
              onValueChange={(value) => setNewType(value as FilePropertyType)}
              value={newType}
            >
              <SelectTrigger className="h-8 min-w-0 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROPERTY_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {PROPERTY_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="col-span-2 justify-start lg:col-span-1"
              disabled={disabled || !newKey.trim()}
              onClick={handleAddProperty}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Plus className="mr-1 h-3 w-3" />
              Add property
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
