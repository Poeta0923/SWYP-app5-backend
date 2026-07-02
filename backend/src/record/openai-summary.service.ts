import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_OPENAI_SUMMARY_MODEL,
  OPENAI_API_KEY_ENV,
  OPENAI_RESPONSES_URL,
  OPENAI_SUMMARY_MODEL_ENV,
} from './record.constants';

type OpenAIResponseContent = {
  type?: unknown;
  text?: unknown;
};

type OpenAIResponseOutput = {
  content?: OpenAIResponseContent[];
};

type OpenAIResponseBody = {
  output_text?: unknown;
  output?: OpenAIResponseOutput[];
};

export interface OpenAISummaryResult {
  summary: string;
  keywords: string[];
}

@Injectable()
export class OpenAISummaryService {
  constructor(private readonly configService: ConfigService) {}

  async summarize(content: string): Promise<OpenAISummaryResult> {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.getRequiredConfig(OPENAI_API_KEY_ENV)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.getSummaryModel(),
        reasoning: { effort: 'low' },
        instructions:
          'STT로 변환된 음성 기록 원문을 한국어로 간결하게 요약하고 핵심 키워드 3개를 추출하세요. 원문에 없는 사실은 추가하지 마세요. 반드시 {"summary":"요약문","keywords":["키워드1","키워드2","키워드3"]} 형태의 JSON만 출력하세요.',
        input: content,
      }),
    });

    if (!response.ok) {
      throw new BadGatewayException({
        code: 'OPENAI_SUMMARY_FAILED',
        message: '기록 내용 요약에 실패했습니다.',
        statusCode: response.status,
      });
    }

    const responseBody = (await response.json()) as OpenAIResponseBody;
    const result = this.extractSummaryResult(responseBody);

    if (!result.summary) {
      throw new BadGatewayException({
        code: 'OPENAI_SUMMARY_EMPTY',
        message: '요약 결과를 찾을 수 없습니다.',
      });
    }

    if (result.keywords.length === 0) {
      throw new BadGatewayException({
        code: 'OPENAI_KEYWORDS_EMPTY',
        message: '키워드 추출 결과를 찾을 수 없습니다.',
      });
    }

    return result;
  }

  private extractSummaryResult(
    responseBody: OpenAIResponseBody,
  ): OpenAISummaryResult {
    const text = this.extractText(responseBody);

    try {
      const parsed = JSON.parse(this.unwrapJsonText(text)) as {
        summary?: unknown;
        keywords?: unknown;
      };

      return {
        summary:
          typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
        keywords: this.normalizeKeywords(parsed.keywords),
      };
    } catch {
      throw new BadGatewayException({
        code: 'OPENAI_SUMMARY_PARSE_FAILED',
        message: '요약 결과를 해석할 수 없습니다.',
      });
    }
  }

  private extractText(responseBody: OpenAIResponseBody): string {
    if (typeof responseBody.output_text === 'string') {
      return responseBody.output_text.trim();
    }

    return (
      responseBody.output
        ?.flatMap((output) => output.content ?? [])
        .map((content) =>
          typeof content.text === 'string' ? content.text.trim() : '',
        )
        .filter((text) => text.length > 0)
        .join('\n')
        .trim() ?? ''
    );
  }

  private unwrapJsonText(text: string): string {
    return text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
  }

  private normalizeKeywords(keywords: unknown): string[] {
    if (!Array.isArray(keywords)) {
      return [];
    }

    const normalizedKeywords = keywords
      .filter((keyword): keyword is string => typeof keyword === 'string')
      .map((keyword) => keyword.trim())
      .filter((keyword) => keyword.length > 0);

    return [...new Set(normalizedKeywords)].slice(0, 3);
  }

  private getSummaryModel(): string {
    return (
      this.configService.get<string>(OPENAI_SUMMARY_MODEL_ENV) ??
      DEFAULT_OPENAI_SUMMARY_MODEL
    );
  }

  private getRequiredConfig(key: string): string {
    const value = this.configService.get<string>(key);

    if (!value) {
      throw new Error(`${key} is required to use OpenAI summary.`);
    }

    return value;
  }
}
