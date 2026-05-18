package piweb

import "regexp"

var secretPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)(api[_-]?key|token|secret|password)(["'\s:=]+)([^"'\s]+)`),
	regexp.MustCompile(`(?i)(authorization:\s*bearer\s+)([^\s]+)`),
	regexp.MustCompile(`(?i)(sk-[a-z0-9_-]{12,})`),
}

func RedactSecrets(value string) string {
	out := value
	for _, pattern := range secretPatterns {
		out = pattern.ReplaceAllStringFunc(out, func(match string) string {
			parts := pattern.FindStringSubmatch(match)
			if len(parts) >= 4 {
				return parts[1] + parts[2] + "[REDACTED]"
			}
			if len(parts) >= 3 {
				return parts[1] + "[REDACTED]"
			}
			return "[REDACTED]"
		})
	}
	return out
}

func RedactPayload(payload any) any {
	switch v := payload.(type) {
	case Message:
		v.Text = RedactSecrets(v.Text)
		v.Args = RedactSecrets(v.Args)
		v.Body = RedactSecrets(v.Body)
		return v
	case map[string]string:
		out := map[string]string{}
		for key, value := range v {
			out[key] = RedactSecrets(value)
		}
		return out
	case map[string]any:
		out := map[string]any{}
		for key, value := range v {
			out[key] = RedactPayload(value)
		}
		return out
	case string:
		return RedactSecrets(v)
	default:
		return payload
	}
}
