import { describe,expect,it } from 'vitest'
import { factorImportSchema } from '../src/domain/factorImport'
const source={title:'Test source only',url:'https://example.org/fixture',reference:'Test table',method:'test-GWP100',geography:'Test',year:2026,license:'Test fixture only'}
const review={reviewer:'Test reviewer',reviewedAt:'2026-11-02T00:00:00.000Z',assessmentMethod:'test-GWP100',unitsChecked:true,boundaryChecked:true,softwareUsePermitted:true}
const input={version:'test-snapshot',unit:'kg CO2e/kg fibre',boundary:'fibre production, cradle-to-gate',review,factors:{elastane:{low:1,central:2,high:3,source}}}
describe('material factor review gate',()=>{
  it('requires a review record and explicit permission for software use',()=>{
    expect(factorImportSchema.safeParse({...input,review:undefined}).success).toBe(false)
    expect(factorImportSchema.safeParse({...input,review:{...review,softwareUsePermitted:false}}).success).toBe(false)
    expect(factorImportSchema.safeParse(input).success).toBe(true)
  })
  it('rejects incompatible methods and finished-material factors in the fibre boundary',()=>{
    expect(factorImportSchema.safeParse({...input,review:{...review,assessmentMethod:'another method'}}).success).toBe(false)
    expect(factorImportSchema.safeParse({...input,factors:{leather:input.factors.elastane}}).success).toBe(false)
    expect(factorImportSchema.safeParse({...input,factors:{other:input.factors.elastane}}).success).toBe(false)
  })
})
