import { describe, expect, it } from 'vitest';
import { classifyQuestionIntent, detectListIntent, detectNamedSearchIntent } from '../src/ai/intent';

describe('classifyQuestionIntent', () => {
  it('routes greetings and general knowledge away from ERP tools', () => {
    const general = [
      'Hello',
      'مرحبا',
      'كيف حالك؟',
      'ما هو الطقس؟',
      'What is the capital of France?',
      'Who are you?',
      'What can you do?',
    ];
    for (const question of general) {
      expect(classifyQuestionIntent(question), question).toBe('general');
    }
  });

  it('keeps ERP questions on the tool path', () => {
    const erp = [
      'How many customers are there?',
      'Hello, how many customers are there?',
      'Show me the defect report',
      'What are the return trends?',
      'What is the most returned product?',
      'كم عميلا لدينا؟',
      'كم عدد المخزون؟',
      'ما هي نسبة مبيعات منتج اسمه HDMI؟',
      'ما هو أكثر منتج يتم ارتجاعه؟',
      'Show me the Touch appliance products currently listed in our ERP.',
      'ما هي أكثر 10 منتجات مبيعاً خلال آخر 6 أشهر؟',
      'ما المنتجات التي زادت مرتجعاتها مقارنة بالفترة السابقة؟',
      'ما المنتجات التي لديها مخزون منخفض مقارنة بمعدل مبيعاتها؟',
      'how many?',
    ];
    for (const question of erp) {
      expect(classifyQuestionIntent(question), question).toBe('erp');
    }
  });

  it('routes plain record-list questions to the deterministic master-data path', () => {
    expect(detectListIntent('اريد قائمة بالموردين')).toEqual({ category: 'suppliers' });
    expect(detectListIntent('list all customers')).toEqual({ category: 'customers' });
    expect(detectListIntent('قائمة المنتجات')).toEqual({ category: 'products' });
    expect(detectListIntent('top 10 products')).toBeUndefined();
    expect(detectListIntent('most returned product')).toBeUndefined();
  });

  it('routes a named product descriptor to record search, not an unfiltered list', () => {
    expect(detectNamedSearchIntent('Show me the Touch appliance products currently listed in our ERP.')).toEqual({
      category: 'products',
      searchTerm: 'Touch',
    });
    expect(detectNamedSearchIntent('Show me the customer list')).toBeUndefined();
    expect(detectNamedSearchIntent('Top 10 products')).toBeUndefined();
  });
});
