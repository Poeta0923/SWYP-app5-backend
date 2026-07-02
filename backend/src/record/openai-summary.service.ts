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

@Injectable()
export class OpenAISummaryService {
  constructor(private readonly configService: ConfigService) {}

  async summarize(content: string): Promise<string> {
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
          'STT로 변환된 음성 기록 원문을 한국어로 간결하게 요약하세요. 원문에 없는 사실은 추가하지 말고, 출력은 요약문만 작성하세요.',
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
    const summary = this.extractSummary(responseBody);

    if (!summary) {
      throw new BadGatewayException({
        code: 'OPENAI_SUMMARY_EMPTY',
        message: '요약 결과를 찾을 수 없습니다.',
      });
    }

    return summary;
  }

  private extractSummary(responseBody: OpenAIResponseBody): string {
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
